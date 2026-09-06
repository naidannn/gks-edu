/**
 * Handing over a PDF the API rendered on demand and never stored — the paper
 * contract (1C-25) and the material checklist (1D-21).
 *
 * Such a file has no signed storage URL to link to: it is fetched with the
 * bearer token and arrives as bytes, so the tab is opened on a blob. A blocked
 * popup is not a failure worth showing an error for — the file is handed over
 * as a download instead.
 */
export function openPdfBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const tab = window.open(url, '_blank');

  if (!tab) {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
  }

  // The new tab still needs the blob to render; revoking it now would blank the page.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
