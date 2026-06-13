using System.Runtime.InteropServices;

namespace SppAdvancedPrintWorker;

/// <summary>
/// Win32 P/Invoke surface for driver settings (DEVMODE) and device capabilities. We use the
/// raw spooler API because System.Drawing.Printing alone cannot show the driver dialog nor
/// reliably round-trip a DEVMODE blob.
/// </summary>
internal static class Win32
{
    [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool OpenPrinter(string pPrinterName, out IntPtr phPrinter, IntPtr pDefault);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    /// <summary>DocumentProperties: query buffer size, get default DEVMODE, or prompt the driver UI.</summary>
    [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern int DocumentProperties(
        IntPtr hwnd,
        IntPtr hPrinter,
        string pDeviceName,
        IntPtr pDevModeOutput,
        IntPtr pDevModeInput,
        int fMode);

    [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern int DeviceCapabilities(
        string pDevice,
        string pPort,
        short fwCapability,
        IntPtr pOutput,
        IntPtr pDevMode);

    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    // GDI — used to query the printer's real printable area for the current paper/DEVMODE.
    [DllImport("gdi32.dll", CharSet = CharSet.Unicode)]
    public static extern IntPtr CreateDC(string? lpszDriver, string lpszDevice, string? lpszOutput, IntPtr lpInitData);

    [DllImport("gdi32.dll")]
    public static extern bool DeleteDC(IntPtr hdc);

    [DllImport("gdi32.dll")]
    public static extern int GetDeviceCaps(IntPtr hdc, int nIndex);

    // GetDeviceCaps indices (device pixels unless noted).
    public const int HORZRES = 8;          // printable width
    public const int VERTRES = 10;         // printable height
    public const int LOGPIXELSX = 88;      // DPI x
    public const int LOGPIXELSY = 90;      // DPI y
    public const int PHYSICALWIDTH = 110;  // full page width
    public const int PHYSICALHEIGHT = 111; // full page height
    public const int PHYSICALOFFSETX = 112; // unprintable left margin
    public const int PHYSICALOFFSETY = 113; // unprintable top margin

    // DocumentProperties fMode flags.
    public const int DM_OUT_BUFFER = 2;
    public const int DM_IN_BUFFER = 8;
    public const int DM_IN_PROMPT = 4;

    // DocumentProperties prompt return values.
    public const int IDOK = 1;
    public const int IDCANCEL = 2;

    // DeviceCapabilities indices.
    public const short DC_PAPERNAMES = 16;
    public const short DC_PAPERS = 2;
    public const short DC_PAPERSIZE = 3;   // size in 0.1mm units
    public const short DC_BINNAMES = 12;
    public const short DC_BINS = 6;
    public const short DC_DUPLEX = 7;
    public const short DC_COLORDEVICE = 32;

    /// <summary>DEVMODE header fields we read for orientation/paper diagnostics.</summary>
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct DEVMODE_HEADER
    {
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string dmDeviceName;
        public short dmSpecVersion;
        public short dmDriverVersion;
        public short dmSize;
        public short dmDriverExtra;
        public int dmFields;
        public short dmOrientation;
        public short dmPaperSize;
        public short dmPaperLength;
        public short dmPaperWidth;
        public short dmScale;
        public short dmCopies;
        public short dmDefaultSource;
        public short dmPrintQuality;
        // (remaining DEVMODE fields omitted — we only inspect the header for diagnostics)
    }

    public const short DMORIENT_PORTRAIT = 1;
    public const short DMORIENT_LANDSCAPE = 2;
}
