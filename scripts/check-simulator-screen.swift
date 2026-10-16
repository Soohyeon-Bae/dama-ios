import AppKit
import Foundation

guard CommandLine.arguments.count == 2,
      let imageData = try? Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1])),
      let bitmap = NSBitmapImageRep(data: imageData) else {
    print("Could not read the iOS Simulator screenshot")
    exit(1)
}

let width = bitmap.pixelsWide
let height = bitmap.pixelsHigh
var sampled = 0
var dark = 0

// Exclude the status bar and home indicator; they appear even on a blank launch screen.
for y in stride(from: height / 10, to: height * 9 / 10, by: max(1, height / 140)) {
    for x in stride(from: width / 10, to: width * 9 / 10, by: max(1, width / 110)) {
        guard let color = bitmap.colorAt(x: x, y: y)?.usingColorSpace(.deviceRGB) else { continue }
        sampled += 1
        let brightness = (color.redComponent + color.greenComponent + color.blueComponent) / 3
        if brightness < 0.65 { dark += 1 }
    }
}

print("iOS screen check: \(dark) dark pixels in \(sampled) samples")
if sampled == 0 || dark < 25 {
    print("Only a blank launch screen was visible")
    exit(1)
}
