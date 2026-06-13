using System.Buffers.Binary;
using System.Drawing.Printing;
using System.Runtime.Versioning;
using System.Text;
using System.Text.Json;

namespace SppAdvancedPrintWorker;

/// <summary>
/// SppAdvancedPrintWorker — the native Windows print helper for SPP2's Advanced Print Engine.
///
/// Speaks the same framed JSON-RPC protocol as the Python smart-selection sidecar:
///   [4-byte big-endian length][UTF-8 JSON]
/// Request:  { "id": number, "method": string, "params": object }
/// Response: { "id": number, "result": any }  or  { "id": number, "error": { "message": string } }
///
/// Commands: health, get-capabilities, open-driver-dialog, get-default-devmode, print, test-page.
/// </summary>
[SupportedOSPlatform("windows")]
internal static class Program
{
    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull
    };

    [STAThread]
    private static int Main()
    {
        var stdin = Console.OpenStandardInput();
        var stdout = Console.OpenStandardOutput();

        while (true)
        {
            JsonDocument? request;
            try
            {
                request = ReadFrame(stdin);
            }
            catch (Exception ex)
            {
                Log("frame read error: " + ex.Message);
                break;
            }
            if (request == null) break; // stdin closed → exit

            long id = 0;
            try
            {
                var root = request.RootElement;
                id = root.TryGetProperty("id", out var idEl) ? idEl.GetInt64() : 0;
                string method = root.GetProperty("method").GetString() ?? "";
                JsonElement parms = root.TryGetProperty("params", out var p) ? p : default;

                object result = Dispatch(method, parms);
                WriteResponse(stdout, id, result, null);
            }
            catch (Exception ex)
            {
                WriteResponse(stdout, id, null, ex.Message);
            }
            finally
            {
                request.Dispose();
            }
        }
        return 0;
    }

    private static object Dispatch(string method, JsonElement parms) => method switch
    {
        "health" => new { ok = true, worker = "SppAdvancedPrintWorker", version = "1.0" },
        "get-capabilities" => GetCapabilities(parms),
        "list-printers" => ListPrinters(),
        "list-icc-profiles" => ListIccProfiles(),
        "get-printable-area" => GetPrintableArea(parms),
        "open-driver-dialog" => OpenDriverDialog(parms),
        "get-default-devmode" => new { devmodeBase64 = DriverSettings.GetDefaultDevmode(GetString(parms, "printerName")) },
        "print" => DoPrint(parms),
        "test-page" => DoPrint(parms), // a test page is a normal print of a caller-supplied image
        _ => throw new InvalidOperationException($"Unknown method: {method}")
    };

    private static object ListPrinters()
    {
        var names = new List<string>();
        foreach (string name in PrinterSettings.InstalledPrinters) names.Add(name);
        return new { printers = names };
    }

    private static object GetCapabilities(JsonElement parms)
    {
        string printer = GetString(parms, "printerName");
        var papers = DriverSettings.GetPapers(printer)
            .Select(p => new { name = p.Name, widthMm = p.WidthMm, heightMm = p.HeightMm, custom = false })
            .ToList();
        var sources = DriverSettings.GetSources(printer);
        bool color = DriverSettings.SupportsColor(printer);
        bool duplex = DriverSettings.SupportsDuplex(printer);

        double maxLong = papers.Count > 0 ? papers.Max(p => Math.Max(p.widthMm, p.heightMm)) : 0;
        bool wideFormat = maxLong > 450; // > A3 long edge → likely wide-format
        bool roll = sources.Any(s => s.Contains("Roll", StringComparison.OrdinalIgnoreCase));

        return new
        {
            windowsPrinterName = printer,
            paperSizes = papers,
            sources,
            printableAreaByPaper = new Dictionary<string, object>(), // filled per-paper on demand (future)
            duplex,
            color,
            resolutionsDpi = new[] { 300, 600 },
            isWideFormat = wideFormat,
            isRoll = roll
        };
    }

    private static object ListIccProfiles()
    {
        var profiles = DriverSettings.ListSystemIccProfiles()
            .Select(p => new { name = p.Name, path = p.Path })
            .ToList();
        return new { profiles };
    }

    private static object GetPrintableArea(JsonElement parms)
    {
        string printer = GetString(parms, "printerName");
        string? devmode = GetStringOrNull(parms, "devmodeBase64");
        var area = DriverSettings.GetPrintableArea(printer, devmode);
        if (area == null) return new { available = false };
        return new
        {
            available = true,
            dpiX = area.DpiX,
            dpiY = area.DpiY,
            physicalWidthMm = area.PhysicalWidthMm,
            physicalHeightMm = area.PhysicalHeightMm,
            printableWidthMm = area.PrintableWidthMm,
            printableHeightMm = area.PrintableHeightMm,
            marginsMm = new { topMm = area.TopMm, rightMm = area.RightMm, bottomMm = area.BottomMm, leftMm = area.LeftMm }
        };
    }

    private static object OpenDriverDialog(JsonElement parms)
    {
        string printer = GetString(parms, "printerName");
        string? seedDevmode = GetStringOrNull(parms, "devmodeBase64");

        // The driver properties dialog is modal and must be owned by a real, foreground window —
        // a background console thread cannot show it. Create a hidden top-most owner form (on this
        // STA thread) so the dialog appears in front of the app.
        string? devmode;
        using (var owner = new System.Windows.Forms.Form
        {
            ShowInTaskbar = false,
            FormBorderStyle = System.Windows.Forms.FormBorderStyle.None,
            StartPosition = System.Windows.Forms.FormStartPosition.Manual,
            Location = new System.Drawing.Point(-4000, -4000),
            Size = new System.Drawing.Size(1, 1),
            TopMost = true
        })
        {
            owner.Show();
            System.Windows.Forms.Application.DoEvents();
            Win32.SetForegroundWindow(owner.Handle);
            devmode = DriverSettings.OpenDriverDialog(printer, owner.Handle, seedDevmode);
            owner.Close();
        }

        if (devmode == null) return new { cancelled = true, devmodeBase64 = (string?)null };

        var state = DriverStateFromDevmode(devmode, printer);
        state["cancelled"] = false;
        return state;
    }

    /// <summary>Parses a captured DEVMODE into the structured driver state the renderer applies to the layout.</summary>
    private static Dictionary<string, object?> DriverStateFromDevmode(string devmodeBase64, string printer)
    {
        var header = DriverSettings.ReadHeader(devmodeBase64);
        string orientation = header?.dmOrientation == Win32.DMORIENT_LANDSCAPE ? "landscape" : "portrait";

        // Paper: prefer explicit width/length (0.1mm); else resolve the DMPAPER_* code via the driver.
        double paperWidthMm = 0, paperHeightMm = 0;
        string paperName = "";
        if (header is { } h)
        {
            if (h.dmPaperWidth > 0 && h.dmPaperLength > 0)
            {
                paperWidthMm = h.dmPaperWidth / 10.0;
                paperHeightMm = h.dmPaperLength / 10.0;
            }
            var byCode = DriverSettings.GetPaperByCode(printer, h.dmPaperSize);
            if (byCode is { } pc)
            {
                paperName = pc.Name;
                if (paperWidthMm <= 0) { paperWidthMm = pc.WidthMm; paperHeightMm = pc.HeightMm; }
            }
        }

        string? sourceName = header is { } h2 ? DriverSettings.GetSourceNameByCode(printer, h2.dmDefaultSource) : null;

        return new Dictionary<string, object?>
        {
            ["devmodeBase64"] = devmodeBase64,
            ["orientation"] = orientation,
            ["driverVersion"] = header?.dmDriverVersion.ToString(),
            ["paperSizeCode"] = header?.dmPaperSize ?? 0,
            ["paperName"] = paperName,
            ["paperWidthMm"] = paperWidthMm,
            ["paperHeightMm"] = paperHeightMm,
            ["sourceCode"] = header?.dmDefaultSource ?? 0,
            ["sourceName"] = sourceName ?? ""
        };
    }

    private static object DoPrint(JsonElement parms)
    {
        // Optional multi-page array: every entry is spooled into one print job.
        List<PrintHandler.PrintPageItem>? pages = null;
        if (parms.ValueKind == JsonValueKind.Object &&
            parms.TryGetProperty("pages", out var pagesEl) &&
            pagesEl.ValueKind == JsonValueKind.Array)
        {
            pages = new List<PrintHandler.PrintPageItem>();
            foreach (var p in pagesEl.EnumerateArray())
            {
                pages.Add(new PrintHandler.PrintPageItem(
                    ImagePath: GetString(p, "imagePath"),
                    PaperWidthMm: GetDouble(p, "paperWidthMm"),
                    PaperHeightMm: GetDouble(p, "paperHeightMm"),
                    PlacementXmm: GetDouble(p, "placementXmm"),
                    PlacementYmm: GetDouble(p, "placementYmm"),
                    PlacementWidthMm: GetDouble(p, "placementWidthMm"),
                    PlacementHeightMm: GetDouble(p, "placementHeightMm")));
            }
            if (pages.Count == 0) pages = null;
        }

        var job = new PrintHandler.PrintJob(
            PrinterName: GetString(parms, "printerName"),
            ImagePath: GetString(parms, "imagePath"),
            DevmodeBase64: GetStringOrNull(parms, "devmodeBase64"),
            PaperWidthMm: GetDouble(parms, "paperWidthMm"),
            PaperHeightMm: GetDouble(parms, "paperHeightMm"),
            PlacementXmm: GetDouble(parms, "placementXmm"),
            PlacementYmm: GetDouble(parms, "placementYmm"),
            PlacementWidthMm: GetDouble(parms, "placementWidthMm"),
            PlacementHeightMm: GetDouble(parms, "placementHeightMm"),
            Copies: (int)GetDouble(parms, "copies", 1),
            Pages: pages);

        var r = PrintHandler.Print(job);
        return new
        {
            success = r.Success,
            actualOrientation = r.ActualOrientation == Win32.DMORIENT_LANDSCAPE ? "landscape" : "portrait",
            actualPaperSize = r.ActualPaperSize,
            devmodeApplied = r.DevmodeApplied,
            error = r.Error,
            diagnostics = r.Diagnostics is { } d ? new
            {
                devicePaperWidthMm = d.DevicePaperWidthMm,
                devicePaperHeightMm = d.DevicePaperHeightMm,
                devicePrintableWidthMm = d.DevicePrintableWidthMm,
                devicePrintableHeightMm = d.DevicePrintableHeightMm,
                hardMarginLeftMm = d.HardMarginLeftMm,
                hardMarginTopMm = d.HardMarginTopMm,
                jobPaperWidthMm = d.JobPaperWidthMm,
                jobPaperHeightMm = d.JobPaperHeightMm,
                paperMismatch = d.PaperMismatch,
                recentered = d.Recentered,
                drawXmm = d.DrawXmm,
                drawYmm = d.DrawYmm,
                drawWidthMm = d.DrawWidthMm,
                drawHeightMm = d.DrawHeightMm,
                originAtMargins = d.OriginAtMargins
            } : null
        };
    }

    // ─── Protocol helpers ────────────────────────────────────────────────────

    private static JsonDocument? ReadFrame(Stream stdin)
    {
        byte[] header = ReadExactly(stdin, 4);
        if (header.Length < 4) return null;
        int length = BinaryPrimitives.ReadInt32BigEndian(header);
        if (length <= 0) return null;
        byte[] body = ReadExactly(stdin, length);
        if (body.Length < length) return null;
        return JsonDocument.Parse(body);
    }

    private static byte[] ReadExactly(Stream s, int count)
    {
        byte[] buf = new byte[count];
        int read = 0;
        while (read < count)
        {
            int n = s.Read(buf, read, count - read);
            if (n <= 0) break; // EOF
            read += n;
        }
        if (read < count) return Array.Empty<byte>();
        return buf;
    }

    private static void WriteResponse(Stream stdout, long id, object? result, string? error)
    {
        object payload = error == null
            ? new { id, result }
            : new { id, error = new { message = error } };
        byte[] body = JsonSerializer.SerializeToUtf8Bytes(payload, JsonOpts);
        byte[] header = new byte[4];
        BinaryPrimitives.WriteInt32BigEndian(header, body.Length);
        lock (typeof(Program))
        {
            stdout.Write(header, 0, 4);
            stdout.Write(body, 0, body.Length);
            stdout.Flush();
        }
    }

    private static void Log(string msg) => Console.Error.WriteLine("[SppAdvancedPrintWorker] " + msg);

    private static string GetString(JsonElement e, string name) =>
        e.ValueKind == JsonValueKind.Object && e.TryGetProperty(name, out var v) ? (v.GetString() ?? "") : "";

    private static string? GetStringOrNull(JsonElement e, string name) =>
        e.ValueKind == JsonValueKind.Object && e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String
            ? v.GetString() : null;

    private static double GetDouble(JsonElement e, string name, double fallback = 0) =>
        e.ValueKind == JsonValueKind.Object && e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.Number
            ? v.GetDouble() : fallback;
}
