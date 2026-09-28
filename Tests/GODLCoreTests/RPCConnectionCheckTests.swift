import Foundation
import XCTest
@testable import GODLCore

private final class ProbeStubState: @unchecked Sendable {
    struct Reply: Sendable {
        var status = 200
        var body = Data(#"{"jsonrpc":"2.0","id":"godl-connection-check","result":"5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d"}"#.utf8)
        var error: URLError?
        var wait = false
    }
    private let lock = NSLock()
    private var reply = Reply()
    private var requests: [URLRequest] = []
    func reset(_ reply: Reply) { lock.withLock { self.reply = reply; requests = [] } }
    func receive(_ request: URLRequest) -> Reply { lock.withLock { requests.append(request); return reply } }
    var received: [URLRequest] { lock.withLock { requests } }
}

private final class ProbeURLProtocol: URLProtocol, @unchecked Sendable {
    static let state = ProbeStubState()
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        let reply = Self.state.receive(request)
        if reply.wait { return }
        if let error = reply.error { client?.urlProtocol(self, didFailWithError: error); return }
        let response = HTTPURLResponse(url: request.url!, statusCode: reply.status, httpVersion: "HTTP/1.1", headerFields: nil)!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: reply.body)
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}

@MainActor
final class RPCConnectionCheckTests: XCTestCase {
    private let endpoint = URL(string: "https://example.invalid/?api-key=SYNTHETIC_TEST_ONLY")!
    private func checker(_ reply: ProbeStubState.Reply = .init()) -> RPCConnectionCheck {
        ProbeURLProtocol.state.reset(reply)
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [ProbeURLProtocol.self]
        return RPCConnectionCheck(configuration: config)
    }
    private func assertFailure(_ reply: ProbeStubState.Reply, _ expected: RPCConnectionError) async {
        do { try await checker(reply).check(endpoint); XCTFail("Must reject") }
        catch {
            XCTAssertEqual(error as? RPCConnectionError, expected)
            XCTAssertFalse(error.localizedDescription.contains("SYNTHETIC_TEST_ONLY"))
            XCTAssertFalse(error.localizedDescription.contains("example.invalid"))
        }
    }

    func testMainnetProbeSendsOnlyGenesisRequest() async throws {
        try await checker().check(endpoint)
        let requests = ProbeURLProtocol.state.received
        XCTAssertEqual(requests.count, 1)
        let request = try XCTUnwrap(requests.first)
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertEqual(request.cachePolicy, .reloadIgnoringLocalCacheData)
        XCTAssertNil(request.value(forHTTPHeaderField: "Cookie"))
        XCTAssertNil(request.value(forHTTPHeaderField: "Authorization"))
        var data = request.httpBody ?? Data()
        if let stream = request.httpBodyStream {
            stream.open(); defer { stream.close() }
            var buffer = [UInt8](repeating: 0, count: 512)
            while stream.hasBytesAvailable {
                let count = stream.read(&buffer, maxLength: buffer.count)
                if count <= 0 { break }; data.append(contentsOf: buffer.prefix(count))
            }
        }
        let payload = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        XCTAssertEqual(Set(payload.keys), ["jsonrpc", "id", "method", "params"])
        XCTAssertEqual(payload["method"] as? String, "getGenesisHash")
        XCTAssertEqual((payload["params"] as? [String])?.count, 0)
    }

    func testHTTPFailuresNeverEchoProviderContent() async {
        for (status, expected) in [(401, RPCConnectionError.unauthorized), (403, .unauthorized),
                                   (429, .rateLimited), (503, .rejected), (302, .redirected)] {
            await assertFailure(.init(status: status, body: Data(endpoint.absoluteString.utf8)), expected)
        }
    }

    func testWrongNetworkMalformedAndOversizedResponsesAreRejected() async {
        await assertFailure(.init(body: Data(#"{"jsonrpc":"2.0","id":"godl-connection-check","result":"devnet"}"#.utf8)), .wrongNetwork)
        for body in ["not JSON", "{}", #"{"jsonrpc":"2.0","id":"wrong","result":"devnet"}"#,
                     #"{"jsonrpc":"2.0","id":"godl-connection-check","error":{"message":"SYNTHETIC_TEST_ONLY"}}"#,
                     String(repeating: "x", count: 16_385)] {
            await assertFailure(.init(body: Data(body.utf8)), .invalidResponse)
        }
    }

    func testTransportErrorsAreFixedSafeMessages() async {
        for (code, expected) in [(URLError.timedOut, RPCConnectionError.timedOut),
                                 (.notConnectedToInternet, .unreachable), (.serverCertificateUntrusted, .unreachable)] {
            await assertFailure(.init(error: URLError(code, userInfo: [NSLocalizedDescriptionKey: endpoint.absoluteString])), expected)
        }
    }

    func testCancellingInFlightRequestReturnsCancellation() async throws {
        let checker = checker(.init(wait: true))
        let endpoint = endpoint
        let task = Task { try await checker.check(endpoint) }
        for _ in 0..<100 where ProbeURLProtocol.state.received.isEmpty { try await Task.sleep(for: .milliseconds(5)) }
        XCTAssertEqual(ProbeURLProtocol.state.received.count, 1)
        task.cancel()
        do { try await task.value; XCTFail("Must cancel") } catch { XCTAssertTrue(error is CancellationError) }
    }

    func testRedirectDelegateNeverFollowsLocation() {
        let session = URLSession(configuration: .ephemeral)
        defer { session.invalidateAndCancel() }
        let redirect = URLRequest(url: URL(string: "https://redirect.invalid/")!)
        RPCProbeDelegate().urlSession(session, task: session.dataTask(with: endpoint),
            willPerformHTTPRedirection: HTTPURLResponse(url: endpoint, statusCode: 307, httpVersion: nil, headerFields: nil)!,
            newRequest: redirect) { request in XCTAssertNil(request) }
    }

    func testInvalidURLNeverStartsRequest() async {
        let checker = checker()
        do {
            try await checker.check(URL(string: "http://example.invalid")!)
            XCTFail("Must reject")
        } catch { XCTAssertTrue(error is WalletSettingsError) }
        XCTAssertTrue(ProbeURLProtocol.state.received.isEmpty)
    }
}
