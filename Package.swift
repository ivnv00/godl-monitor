// swift-tools-version: 6.0

import PackageDescription

let package = Package(
    name: "GODLMacOS",
    platforms: [.macOS(.v14)],
    products: [
        .library(name: "GODLCore", targets: ["GODLCore"]),
        .executable(name: "GODLMonitor", targets: ["GODLMonitor"]),
    ],
    targets: [
        .target(name: "GODLCore"),
        .executableTarget(name: "GODLMonitor", dependencies: ["GODLCore"], resources: [.process("Resources")]),
        .testTarget(name: "GODLCoreTests", dependencies: ["GODLCore"]),
    ]
)
