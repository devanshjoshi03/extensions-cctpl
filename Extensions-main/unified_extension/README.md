# CoversCrafter Unified Extension

Single Chrome extension that bundles Bajaj, ICICI Lombard, Universal Sompo, Oriental Insurance, and Go Digit automation.

## Load in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `unified_extension` folder

**Disable** the old separate extensions (Bajaj, ICICI, Sompo, Oriental) to avoid duplicate content scripts on the same sites.

## Usage

1. Click the extension icon → pick an insurer
2. Use that insurer’s popup (paste JSON, Start, Pause/Stop) as before
3. **← All insurers** returns to the hub
4. **Settings** → shared OpenAI key + per-insurer config pages

## Updating provider code

After editing `Bajaj_extension`, `icici_extension`, `Sompo_extension`, `orential`, or `GoDigit_extension`, run from PowerShell:

```powershell
.\sync-providers.ps1
```

Then re-apply the hub navigation blocks in each `providers/*/popup.html` and `providers/godigit/config.html` if those files were overwritten.
