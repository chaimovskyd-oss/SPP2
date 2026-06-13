using System.Drawing;
using System.Drawing.Printing;
using System.Runtime.InteropServices;
using System.Runtime.Versioning;

namespace SppAdvancedPrintWorker;

/// <summary>
/// Sends a rendered bitmap to a Windows printer, replaying a saved DEVMODE so driver-owned
/// settings (tray, paper, orientation, borderless, quality) are honored rather than fought.
/// </summary>
[SupportedOSPlatform("windows")]
internal static class PrintHandler
{
    /// <summary>One page of a job: its image plus paper + placement, all in millimeters.</summary>
    public record PrintPageItem(
        string ImagePath,
        double PaperWidthMm,
        double PaperHeightMm,
        double PlacementXmm,
        double PlacementYmm,
        double PlacementWidthMm,
        double PlacementHeightMm);

    public record PrintJob(
        string PrinterName,
        string ImagePath,
        string? DevmodeBase64,
        double PaperWidthMm,
        double PaperHeightMm,
        double PlacementXmm,
        double PlacementYmm,
        double PlacementWidthMm,
        double PlacementHeightMm,
        int Copies,
        // When supplied (and non-empty), every page is spooled into ONE document. When null,
        // the flat single-image fields above are used (legacy / test-page path).
        IReadOnlyList<PrintPageItem>? Pages = null);

    public record PrintResult(
        bool Success,
        short ActualOrientation,
        short ActualPaperSize,
        bool DevmodeApplied,
        string? Error,
        PrintDiagnostics? Diagnostics = null);

    /// <summary>
    /// What the device actually reported at print time vs. what the job asked for. This is the
    /// single most useful thing to inspect when a print lands off-center or cropped: it exposes the
    /// real paper size, printable area, and hardware margins the driver enforced (from the applied
    /// DEVMODE), alongside the placement rectangle we actually drew.
    /// </summary>
    public record PrintDiagnostics(
        double DevicePaperWidthMm, double DevicePaperHeightMm,
        double DevicePrintableWidthMm, double DevicePrintableHeightMm,
        double HardMarginLeftMm, double HardMarginTopMm,
        double JobPaperWidthMm, double JobPaperHeightMm,
        bool PaperMismatch, bool Recentered,
        double DrawXmm, double DrawYmm, double DrawWidthMm, double DrawHeightMm,
        bool OriginAtMargins);

    private static int MmToHundredthsInch(double mm) => (int)Math.Round(mm / 25.4 * 100.0);
    private static double HundredthsInchToMm(double v) => v / 100.0 * 25.4;

    public static PrintResult Print(PrintJob job)
    {
        var ps = new PrinterSettings { PrinterName = job.PrinterName };
        if (!ps.IsValid)
            return new PrintResult(false, 0, 0, false, $"Printer not found: {job.PrinterName}");

        // Normalize to a page list. Multi-page jobs ship a Pages array; legacy / test-page
        // callers ship only the flat single-image fields, which become a one-page list.
        var items = (job.Pages is { Count: > 0 })
            ? job.Pages
            : new List<PrintPageItem>
            {
                new(job.ImagePath, job.PaperWidthMm, job.PaperHeightMm,
                    job.PlacementXmm, job.PlacementYmm, job.PlacementWidthMm, job.PlacementHeightMm)
            };

        bool devmodeApplied = false;
        IntPtr hGlobal = IntPtr.Zero;
        var images = new List<Image>();

        using var doc = new PrintDocument();
        try
        {
            if (!string.IsNullOrEmpty(job.DevmodeBase64))
            {
                byte[] bytes = Convert.FromBase64String(job.DevmodeBase64);
                hGlobal = Marshal.AllocHGlobal(bytes.Length);
                Marshal.Copy(bytes, 0, hGlobal, bytes.Length);
                try
                {
                    ps.SetHdevmode(hGlobal);
                    devmodeApplied = true;
                }
                catch
                {
                    devmodeApplied = false; // stale/invalid DEVMODE — caller is informed via result
                }
            }

            ps.Copies = (short)Math.Max(1, job.Copies);
            doc.PrinterSettings = ps;
            if (devmodeApplied)
            {
                try { doc.DefaultPageSettings.SetHdevmode(hGlobal); } catch { /* keep going with printer DEVMODE */ }
            }
            doc.PrintController = new StandardPrintController(); // suppress the progress dialog
            // Origin at the printable-area corner (the GDI default). We convert the job's
            // physical-page-relative placement into this space by subtracting the hardware margins.
            doc.OriginAtMargins = false;

            foreach (var it in items) images.Add(Image.FromFile(it.ImagePath));
            PrintDiagnostics? diag = null;
            int pageIndex = 0;

            // Before each page, request that page's paper size when it differs from what the
            // device currently reports — lets a single job mix paper sizes across pages.
            doc.QueryPageSettings += (sender, e) =>
            {
                if (pageIndex < 0 || pageIndex >= items.Count) return;
                var it = items[pageIndex];
                if (it.PaperWidthMm <= 1 || it.PaperHeightMm <= 1) return;
                int wantWhi = MmToHundredthsInch(it.PaperWidthMm);
                int wantHhi = MmToHundredthsInch(it.PaperHeightMm);
                var cur = e.PageSettings.PaperSize;
                if (Math.Abs(cur.Width - wantWhi) > 2 || Math.Abs(cur.Height - wantHhi) > 2)
                {
                    try { e.PageSettings.PaperSize = new PaperSize("SppCustom", wantWhi, wantHhi); }
                    catch { /* driver may reject custom paper — fall back to its own page settings */ }
                }
            };

            doc.PrintPage += (sender, e) =>
            {
                if (e.Graphics == null) return;
                var item = items[pageIndex];
                var image = images[pageIndex];

                // What the device actually gives us for THIS page (reflects the applied DEVMODE).
                // PaperSize / PrintableArea / HardMargin* are all in hundredths of an inch.
                var page = e.PageSettings;
                double devPaperWmm = HundredthsInchToMm(page.PaperSize.Width);
                double devPaperHmm = HundredthsInchToMm(page.PaperSize.Height);
                double hardLeftHi = page.HardMarginX;   // unprintable left margin (100ths inch)
                double hardTopHi = page.HardMarginY;    // unprintable top margin (100ths inch)
                var printable = page.PrintableArea;     // RectangleF, 100ths inch

                // The page's placement, in physical-page coordinates (origin = sheet corner).
                double xHi = item.PlacementXmm / 25.4 * 100.0;
                double yHi = item.PlacementYmm / 25.4 * 100.0;
                double wHi = item.PlacementWidthMm / 25.4 * 100.0;
                double hHi = item.PlacementHeightMm / 25.4 * 100.0;

                // Safety net: if the DEVMODE that actually printed is on different paper than the page
                // was laid out for, the centering math is against the wrong sheet — recenter the
                // requested size on the real device page so it isn't dumped in the top-left and clipped.
                bool mismatch =
                    devPaperWmm > 1 && devPaperHmm > 1 &&
                    (Math.Abs(devPaperWmm - item.PaperWidthMm) > 2.0 || Math.Abs(devPaperHmm - item.PaperHeightMm) > 2.0);
                bool recentered = false;
                if (mismatch)
                {
                    double devPaperWhi = page.PaperSize.Width;
                    double devPaperHhi = page.PaperSize.Height;
                    xHi = (devPaperWhi - wHi) / 2.0;
                    yHi = (devPaperHhi - hHi) / 2.0;
                    recentered = true;
                }

                // Convert physical-page coordinates → printable-area-origin coordinates (GDI space).
                float drawX = (float)(xHi - hardLeftHi);
                float drawY = (float)(yHi - hardTopHi);

                e.Graphics.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
                e.Graphics.PixelOffsetMode = System.Drawing.Drawing2D.PixelOffsetMode.HighQuality;
                e.Graphics.DrawImage(image, new RectangleF(drawX, drawY, (float)wHi, (float)hHi));

                diag = new PrintDiagnostics(
                    devPaperWmm, devPaperHmm,
                    HundredthsInchToMm(printable.Width), HundredthsInchToMm(printable.Height),
                    HundredthsInchToMm(hardLeftHi), HundredthsInchToMm(hardTopHi),
                    item.PaperWidthMm, item.PaperHeightMm,
                    mismatch, recentered,
                    HundredthsInchToMm(xHi), HundredthsInchToMm(yHi),
                    item.PlacementWidthMm, item.PlacementHeightMm,
                    doc.OriginAtMargins);

                Console.Error.WriteLine(
                    $"[SppAdvancedPrintWorker] print page {pageIndex + 1}/{items.Count}: " +
                    $"devPaper={devPaperWmm:F1}x{devPaperHmm:F1}mm jobPaper={item.PaperWidthMm:F1}x{item.PaperHeightMm:F1}mm " +
                    $"hardMargin=({HundredthsInchToMm(hardLeftHi):F1},{HundredthsInchToMm(hardTopHi):F1})mm " +
                    $"printable={HundredthsInchToMm(printable.Width):F1}x{HundredthsInchToMm(printable.Height):F1}mm " +
                    $"draw=({HundredthsInchToMm(xHi):F1},{HundredthsInchToMm(yHi):F1},{item.PlacementWidthMm:F1},{item.PlacementHeightMm:F1})mm " +
                    $"mismatch={mismatch} recentered={recentered}");

                pageIndex++;
                e.HasMorePages = pageIndex < items.Count;
            };

            doc.Print();

            short orientation = doc.DefaultPageSettings.Landscape ? Win32.DMORIENT_LANDSCAPE : Win32.DMORIENT_PORTRAIT;
            short paperKind = (short)doc.DefaultPageSettings.PaperSize.RawKind;
            return new PrintResult(true, orientation, paperKind, devmodeApplied, null, diag);
        }
        catch (Exception ex)
        {
            return new PrintResult(false, 0, 0, devmodeApplied, ex.Message);
        }
        finally
        {
            foreach (var img in images) img.Dispose();
            if (hGlobal != IntPtr.Zero) Marshal.FreeHGlobal(hGlobal);
        }
    }
}
