using System.Runtime.InteropServices;
using System.Text;

namespace SppAdvancedPrintWorker;

/// <summary>
/// DEVMODE capture/replay and capability queries. Captures the driver's settings as an opaque
/// base64 blob the app can store in a profile and replay later, exactly like Photoshop saving
/// printer settings.
/// </summary>
internal static class DriverSettings
{
    /// <summary>
    /// Opens the printer driver's settings dialog and returns the resulting DEVMODE as base64,
    /// or null if the user cancelled. The dialog is seeded with <paramref name="seedDevmodeBase64"/>
    /// when supplied (so reopening it shows the user's LAST saved settings, not the printer default),
    /// otherwise with the printer's current default DEVMODE. Requires a real owner hwnd for the modal dialog.
    /// </summary>
    public static string? OpenDriverDialog(string printerName, IntPtr parentHwnd, string? seedDevmodeBase64 = null)
    {
        if (!Win32.OpenPrinter(printerName, out IntPtr hPrinter, IntPtr.Zero) || hPrinter == IntPtr.Zero)
            return null;
        try
        {
            int size = Win32.DocumentProperties(parentHwnd, hPrinter, printerName, IntPtr.Zero, IntPtr.Zero, 0);
            if (size <= 0) return null;

            IntPtr input = Marshal.AllocHGlobal(size);
            IntPtr output = Marshal.AllocHGlobal(size);
            try
            {
                bool seeded = false;
                // Prefer the caller's saved DEVMODE so the dialog reopens with the user's last choices
                // (paper, tray, borderless …) instead of resetting to the driver default every time.
                if (!string.IsNullOrEmpty(seedDevmodeBase64))
                {
                    try
                    {
                        byte[] seed = Convert.FromBase64String(seedDevmodeBase64);
                        // Only trust a seed that fits this driver's DEVMODE buffer (same driver/version).
                        if (seed.Length > 0 && seed.Length <= size)
                        {
                            Marshal.Copy(seed, 0, input, seed.Length);
                            seeded = true;
                        }
                    }
                    catch { seeded = false; }
                }
                // Fall back to the current default DEVMODE so the dialog still opens populated.
                if (!seeded)
                    Win32.DocumentProperties(parentHwnd, hPrinter, printerName, input, IntPtr.Zero, Win32.DM_OUT_BUFFER);

                // Prompt the driver UI; merge our seed (DM_IN_BUFFER) and write the edited DEVMODE to output.
                int ret = Win32.DocumentProperties(
                    parentHwnd, hPrinter, printerName, output, input,
                    Win32.DM_IN_BUFFER | Win32.DM_IN_PROMPT | Win32.DM_OUT_BUFFER);
                if (ret != Win32.IDOK) return null; // cancelled or error

                byte[] bytes = new byte[size];
                Marshal.Copy(output, bytes, 0, size);
                return Convert.ToBase64String(bytes);
            }
            finally
            {
                Marshal.FreeHGlobal(input);
                Marshal.FreeHGlobal(output);
            }
        }
        finally
        {
            Win32.ClosePrinter(hPrinter);
        }
    }

    public record IccProfile(string Name, string Path);

    /// <summary>Enumerates the ICC/ICM color profiles installed on the machine (the system color spool dir).</summary>
    public static List<IccProfile> ListSystemIccProfiles()
    {
        var result = new List<IccProfile>();
        try
        {
            string dir = System.IO.Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.System),
                "spool", "drivers", "color");
            if (!System.IO.Directory.Exists(dir)) return result;
            foreach (string path in System.IO.Directory.EnumerateFiles(dir))
            {
                string ext = System.IO.Path.GetExtension(path).ToLowerInvariant();
                if (ext != ".icc" && ext != ".icm") continue;
                result.Add(new IccProfile(System.IO.Path.GetFileNameWithoutExtension(path), path));
            }
        }
        catch { /* return what we have */ }
        result.Sort((a, b) => string.Compare(a.Name, b.Name, StringComparison.OrdinalIgnoreCase));
        return result;
    }

    /// <summary>Reads the default DEVMODE for a printer (no UI) as base64.</summary>
    public static string? GetDefaultDevmode(string printerName)
    {
        if (!Win32.OpenPrinter(printerName, out IntPtr hPrinter, IntPtr.Zero) || hPrinter == IntPtr.Zero)
            return null;
        try
        {
            int size = Win32.DocumentProperties(IntPtr.Zero, hPrinter, printerName, IntPtr.Zero, IntPtr.Zero, 0);
            if (size <= 0) return null;
            IntPtr buffer = Marshal.AllocHGlobal(size);
            try
            {
                int ret = Win32.DocumentProperties(IntPtr.Zero, hPrinter, printerName, buffer, IntPtr.Zero, Win32.DM_OUT_BUFFER);
                if (ret < 0) return null;
                byte[] bytes = new byte[size];
                Marshal.Copy(buffer, bytes, 0, size);
                return Convert.ToBase64String(bytes);
            }
            finally { Marshal.FreeHGlobal(buffer); }
        }
        finally { Win32.ClosePrinter(hPrinter); }
    }

    /// <summary>Reads the DEVMODE header for diagnostics (orientation/paper/source).</summary>
    public static Win32.DEVMODE_HEADER? ReadHeader(string base64)
    {
        try
        {
            byte[] bytes = Convert.FromBase64String(base64);
            int headerSize = Marshal.SizeOf<Win32.DEVMODE_HEADER>();
            if (bytes.Length < headerSize) return null;
            IntPtr ptr = Marshal.AllocHGlobal(bytes.Length);
            try
            {
                Marshal.Copy(bytes, 0, ptr, bytes.Length);
                return Marshal.PtrToStructure<Win32.DEVMODE_HEADER>(ptr);
            }
            finally { Marshal.FreeHGlobal(ptr); }
        }
        catch { return null; }
    }

    public record PaperInfo(string Name, double WidthMm, double HeightMm);

    /// <summary>Queries the driver for supported paper sizes (names + dimensions).</summary>
    public static List<PaperInfo> GetPapers(string printerName)
    {
        var result = new List<PaperInfo>();
        int count = Win32.DeviceCapabilities(printerName, "", Win32.DC_PAPERNAMES, IntPtr.Zero, IntPtr.Zero);
        if (count <= 0) return result;

        const int nameLen = 64;
        IntPtr namesBuf = Marshal.AllocHGlobal(count * nameLen * 2);
        IntPtr sizeBuf = Marshal.AllocHGlobal(count * 4); // POINT (LONG x, LONG y) in 0.1mm
        try
        {
            Win32.DeviceCapabilities(printerName, "", Win32.DC_PAPERNAMES, namesBuf, IntPtr.Zero);
            Win32.DeviceCapabilities(printerName, "", Win32.DC_PAPERSIZE, sizeBuf, IntPtr.Zero);
            for (int i = 0; i < count; i++)
            {
                string name = ReadFixedString(IntPtr.Add(namesBuf, i * nameLen * 2), nameLen);
                int x = Marshal.ReadInt32(sizeBuf, i * 8);
                int y = Marshal.ReadInt32(sizeBuf, i * 8 + 4);
                result.Add(new PaperInfo(name, x / 10.0, y / 10.0));
            }
        }
        finally
        {
            Marshal.FreeHGlobal(namesBuf);
            Marshal.FreeHGlobal(sizeBuf);
        }
        return result;
    }

    /// <summary>Queries the driver for tray/source names.</summary>
    public static List<string> GetSources(string printerName)
    {
        var result = new List<string>();
        int count = Win32.DeviceCapabilities(printerName, "", Win32.DC_BINNAMES, IntPtr.Zero, IntPtr.Zero);
        if (count <= 0) return result;
        const int nameLen = 24;
        IntPtr buf = Marshal.AllocHGlobal(count * nameLen * 2);
        try
        {
            Win32.DeviceCapabilities(printerName, "", Win32.DC_BINNAMES, buf, IntPtr.Zero);
            for (int i = 0; i < count; i++)
            {
                string name = ReadFixedString(IntPtr.Add(buf, i * nameLen * 2), nameLen);
                if (name.Length > 0) result.Add(name);
            }
        }
        finally { Marshal.FreeHGlobal(buf); }
        return result;
    }

    /// <summary>Reads a fixed-width UTF-16 buffer slot, truncating at the first NUL (the rest is uninitialized memory).</summary>
    private static string ReadFixedString(IntPtr ptr, int maxChars)
    {
        var sb = new StringBuilder(maxChars);
        for (int i = 0; i < maxChars; i++)
        {
            char c = (char)Marshal.ReadInt16(ptr, i * 2);
            if (c == '\0') break;
            sb.Append(c);
        }
        return sb.ToString().Trim();
    }

    /// <summary>Resolves a DMPAPER_* code to (name, widthMm, heightMm) via DeviceCapabilities. Null if not found.</summary>
    public static (string Name, double WidthMm, double HeightMm)? GetPaperByCode(string printerName, short code)
    {
        int count = Win32.DeviceCapabilities(printerName, "", Win32.DC_PAPERS, IntPtr.Zero, IntPtr.Zero);
        if (count <= 0) return null;
        const int nameLen = 64;
        IntPtr codesBuf = Marshal.AllocHGlobal(count * 2);
        IntPtr sizeBuf = Marshal.AllocHGlobal(count * 8);
        IntPtr namesBuf = Marshal.AllocHGlobal(count * nameLen * 2);
        try
        {
            Win32.DeviceCapabilities(printerName, "", Win32.DC_PAPERS, codesBuf, IntPtr.Zero);
            Win32.DeviceCapabilities(printerName, "", Win32.DC_PAPERSIZE, sizeBuf, IntPtr.Zero);
            Win32.DeviceCapabilities(printerName, "", Win32.DC_PAPERNAMES, namesBuf, IntPtr.Zero);
            for (int i = 0; i < count; i++)
            {
                short c = Marshal.ReadInt16(codesBuf, i * 2);
                if (c != code) continue;
                int x = Marshal.ReadInt32(sizeBuf, i * 8);
                int y = Marshal.ReadInt32(sizeBuf, i * 8 + 4);
                string name = ReadFixedString(IntPtr.Add(namesBuf, i * nameLen * 2), nameLen);
                return (name, x / 10.0, y / 10.0);
            }
        }
        finally
        {
            Marshal.FreeHGlobal(codesBuf);
            Marshal.FreeHGlobal(sizeBuf);
            Marshal.FreeHGlobal(namesBuf);
        }
        return null;
    }

    /// <summary>Resolves a DMBIN_* source code to its human name via DeviceCapabilities. Null if not found.</summary>
    public static string? GetSourceNameByCode(string printerName, short code)
    {
        int count = Win32.DeviceCapabilities(printerName, "", Win32.DC_BINS, IntPtr.Zero, IntPtr.Zero);
        if (count <= 0) return null;
        const int nameLen = 24;
        IntPtr codesBuf = Marshal.AllocHGlobal(count * 2);
        IntPtr namesBuf = Marshal.AllocHGlobal(count * nameLen * 2);
        try
        {
            Win32.DeviceCapabilities(printerName, "", Win32.DC_BINS, codesBuf, IntPtr.Zero);
            Win32.DeviceCapabilities(printerName, "", Win32.DC_BINNAMES, namesBuf, IntPtr.Zero);
            for (int i = 0; i < count; i++)
            {
                short c = Marshal.ReadInt16(codesBuf, i * 2);
                if (c != code) continue;
                return ReadFixedString(IntPtr.Add(namesBuf, i * nameLen * 2), nameLen);
            }
        }
        finally
        {
            Marshal.FreeHGlobal(codesBuf);
            Marshal.FreeHGlobal(namesBuf);
        }
        return null;
    }

    public record PrintableArea(
        double TopMm, double RightMm, double BottomMm, double LeftMm,
        double PrintableWidthMm, double PrintableHeightMm,
        double PhysicalWidthMm, double PhysicalHeightMm,
        int DpiX, int DpiY);

    /// <summary>
    /// Queries the printer's real printable area (the hardware margins it enforces) for the paper
    /// encoded in the supplied DEVMODE (or the printer default if none). This is what makes a true
    /// "scale to fit" possible — the design is fit inside the printable area, not the full sheet.
    /// </summary>
    public static PrintableArea? GetPrintableArea(string printerName, string? devmodeBase64)
    {
        IntPtr dm = IntPtr.Zero;
        if (!string.IsNullOrEmpty(devmodeBase64))
        {
            try
            {
                byte[] bytes = Convert.FromBase64String(devmodeBase64);
                dm = Marshal.AllocHGlobal(bytes.Length);
                Marshal.Copy(bytes, 0, dm, bytes.Length);
            }
            catch { dm = IntPtr.Zero; }
        }
        try
        {
            IntPtr hdc = Win32.CreateDC("WINSPOOL", printerName, null, dm);
            if (hdc == IntPtr.Zero) return null;
            try
            {
                int dpiX = Win32.GetDeviceCaps(hdc, Win32.LOGPIXELSX);
                int dpiY = Win32.GetDeviceCaps(hdc, Win32.LOGPIXELSY);
                if (dpiX <= 0 || dpiY <= 0) return null;

                double mmX = 25.4 / dpiX, mmY = 25.4 / dpiY;
                double physWmm = Win32.GetDeviceCaps(hdc, Win32.PHYSICALWIDTH) * mmX;
                double physHmm = Win32.GetDeviceCaps(hdc, Win32.PHYSICALHEIGHT) * mmY;
                double leftMm = Win32.GetDeviceCaps(hdc, Win32.PHYSICALOFFSETX) * mmX;
                double topMm = Win32.GetDeviceCaps(hdc, Win32.PHYSICALOFFSETY) * mmY;
                double prWmm = Win32.GetDeviceCaps(hdc, Win32.HORZRES) * mmX;
                double prHmm = Win32.GetDeviceCaps(hdc, Win32.VERTRES) * mmY;
                double rightMm = Math.Max(0, physWmm - leftMm - prWmm);
                double bottomMm = Math.Max(0, physHmm - topMm - prHmm);

                return new PrintableArea(topMm, rightMm, bottomMm, leftMm, prWmm, prHmm, physWmm, physHmm, dpiX, dpiY);
            }
            finally { Win32.DeleteDC(hdc); }
        }
        finally { if (dm != IntPtr.Zero) Marshal.FreeHGlobal(dm); }
    }

    public static bool SupportsColor(string printerName) =>
        Win32.DeviceCapabilities(printerName, "", Win32.DC_COLORDEVICE, IntPtr.Zero, IntPtr.Zero) == 1;

    public static bool SupportsDuplex(string printerName) =>
        Win32.DeviceCapabilities(printerName, "", Win32.DC_DUPLEX, IntPtr.Zero, IntPtr.Zero) == 1;
}
