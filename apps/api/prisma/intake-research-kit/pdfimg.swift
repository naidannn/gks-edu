// pdfimg.swift <file.pdf> <first> <last> <outPrefix> — render pages first..last (1-based) to <outPrefix>-<n>.png
// at 2x, for reading scanned / image-only / cell-losing PDF tables with the Read tool.
import Foundation; import PDFKit; import AppKit
let a = CommandLine.arguments
guard a.count == 5, let doc = PDFDocument(url: URL(fileURLWithPath: a[1])), let first = Int(a[2]), let last = Int(a[3]) else {
  print("usage: pdfimg.swift file.pdf first last outPrefix"); exit(1)
}
for n in max(first, 1)...min(last, doc.pageCount) {
  let page = doc.page(at: n - 1)!
  let rect = page.bounds(for: .mediaBox); let scale: CGFloat = 2
  let image = NSImage(size: NSSize(width: rect.width * scale, height: rect.height * scale))
  image.lockFocus(); let ctx = NSGraphicsContext.current!.cgContext
  ctx.setFillColor(NSColor.white.cgColor)
  ctx.fill(CGRect(x: 0, y: 0, width: rect.width * scale, height: rect.height * scale))
  ctx.scaleBy(x: scale, y: scale); page.draw(with: .mediaBox, to: ctx); image.unlockFocus()
  let rep = NSBitmapImageRep(data: image.tiffRepresentation!)!
  try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: "\(a[4])-\(n).png"))
}
print("\(doc.pageCount) pages in file")
