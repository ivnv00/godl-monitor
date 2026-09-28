import Foundation

public enum RPCConnectionError: Error, LocalizedError, Equatable {
    case unauthorized, rateLimited, timedOut, unreachable, wrongNetwork, invalidResponse, redirected, rejected

    public var errorDescription: String? {
        switch self {
        case .unauthorized: "The provider rejected access. Check your key and its access rules."
        case .rateLimited: "The provider is rate-limiting requests. Wait, then try again."
        case .timedOut: "The connection check timed out. Check your connection and try again."
        case .unreachable: "Couldn’t reach the provider securely. Check your connection and HTTPS RPC URL."
        case .wrongNetwork: "This endpoint is not Solana Mainnet. Copy the Mainnet HTTPS RPC URL from your provider."
        case .invalidResponse: "The endpoint did not return a valid Solana RPC response. Check the RPC URL."
        case .redirected: "The endpoint redirects requests. Use your provider’s direct HTTPS RPC URL."
        case .rejected: "The provider could not complete the check. Check the RPC URL or try again later."
        }
    }
}

/// A wallet-free probe. Only fixed errors cross this boundary; provider text stays private.
public struct RPCConnectionCheck: Sendable {
    private let configuration: URLSessionConfiguration
    public init() { configuration = .ephemeral }
    init(configuration: URLSessionConfiguration) { self.configuration = configuration }

    public func check(_ endpoint: URL) async throws {
        // Validate even when called outside the settings form.
        _ = try WalletSettingsStore.rpcEndpoint(endpoint.absoluteString)
        try Task.checkCancellation()
        let configuration = configuration.copy() as! URLSessionConfiguration
        configuration.urlCache = nil
        configuration.urlCredentialStorage = nil
        configuration.httpCookieStorage = nil
        configuration.httpShouldSetCookies = false
        configuration.timeoutIntervalForRequest = 12
        configuration.timeoutIntervalForResource = 15
        let session = URLSession(configuration: configuration, delegate: RPCProbeDelegate(), delegateQueue: nil)
        defer { session.invalidateAndCancel() }
        var request = URLRequest(url: endpoint, cachePolicy: .reloadIgnoringLocalCacheData)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = Data(#"{"jsonrpc":"2.0","id":"godl-connection-check","method":"getGenesisHash","params":[]}"#.utf8)
        do {
            let (bytes, response) = try await session.bytes(for: request)
            guard let response = response as? HTTPURLResponse else { throw RPCConnectionError.invalidResponse }
            switch response.statusCode {
            case 200...299: break
            case 300...399: throw RPCConnectionError.redirected
            case 401, 403: throw RPCConnectionError.unauthorized
            case 429: throw RPCConnectionError.rateLimited
            default: throw RPCConnectionError.rejected
            }
            let limit = 16_384
            guard response.expectedContentLength <= limit else { throw RPCConnectionError.invalidResponse }
            var data = Data()
            for try await byte in bytes {
                try Task.checkCancellation()
                guard data.count < limit else { throw RPCConnectionError.invalidResponse }
                data.append(byte)
            }
            try Task.checkCancellation()
            guard let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  payload["jsonrpc"] as? String == "2.0",
                  payload["id"] as? String == "godl-connection-check",
                  payload["error"] == nil || payload["error"] is NSNull,
                  let genesis = payload["result"] as? String, !genesis.isEmpty else {
                throw RPCConnectionError.invalidResponse
            }
            guard genesis == "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d" else {
                throw RPCConnectionError.wrongNetwork
            }
        } catch {
            if Task.isCancelled || (error as? URLError)?.code == .cancelled { throw CancellationError() }
            if let error = error as? RPCConnectionError { throw error }
            if (error as? URLError)?.code == .timedOut { throw RPCConnectionError.timedOut }
            throw RPCConnectionError.unreachable
        }
    }
}

final class RPCProbeDelegate: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask,
                    willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest,
                    completionHandler: @escaping @Sendable (URLRequest?) -> Void) {
        completionHandler(nil)
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didReceive challenge: URLAuthenticationChallenge,
                    completionHandler: @escaping @Sendable (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
        // Keep normal certificate validation; never offer stored HTTP credentials.
        completionHandler(challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust
                          ? .performDefaultHandling : .cancelAuthenticationChallenge, nil)
    }
}
