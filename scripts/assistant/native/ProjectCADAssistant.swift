import Cocoa
import SwiftUI

private let accent = Color(red: 0.16, green: 0.43, blue: 0.35)
private let dataDirectory = ProcessInfo.processInfo.environment["PROJECT_CAD_ASSISTANT_DATA"].map { URL(fileURLWithPath: $0, isDirectory: true) } ?? FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".project-cad/assistant", isDirectory: true)

private let agentNames = ["codex": "Codex", "claude": "Claude Code", "muse": "Muse"]
struct AgentSelection: Codable {
    var providers: [String]
    var preferred: String
}
struct CompanionSettings: Codable {
    var websiteUrl = "https://projectcad.vercel.app"
    var startAtLogin = true
    var museApiKey = ""
    var agents: AgentSelection?
    enum CodingKeys: String, CodingKey { case websiteUrl, startAtLogin, museApiKey, agents }
    init() {}
    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        websiteUrl = try values.decodeIfPresent(String.self, forKey: .websiteUrl) ?? websiteUrl
        startAtLogin = try values.decodeIfPresent(Bool.self, forKey: .startAtLogin) ?? startAtLogin
        museApiKey = try values.decodeIfPresent(String.self, forKey: .museApiKey) ?? museApiKey
        agents = try values.decodeIfPresent(AgentSelection.self, forKey: .agents)
    }
}
struct CompanionStatus: Decodable {
    var running: Bool
    var managed: Bool
    var codexAvailable: Bool
    var claudeAvailable: Bool
    var museConfigured: Bool
    var message: String
    var agents: AgentSelection?
    var connections: [PendingConnection]?
}
struct PendingConnection: Decodable {
    var id: String
    var origin: String
    var agents: AgentSelection
}

func privateNode() -> URL {
    var value: Int32 = 0
    var size = MemoryLayout<Int32>.size
    sysctlbyname("hw.optional.arm64", &value, &size, nil, 0)
    return Bundle.main.resourceURL!.appendingPathComponent("runtime/\(value == 1 ? "arm64" : "x64")/node")
}

func control(_ arguments: [String]) throws -> Data {
    let process = Process(), pipe = Pipe()
    process.executableURL = privateNode()
    process.arguments = [Bundle.main.resourceURL!.appendingPathComponent("app/control.mjs").path] + arguments
    var environment = ProcessInfo.processInfo.environment
    environment["PATH"] = [privateNode().deletingLastPathComponent().path, FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".local/bin").path, "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin"].joined(separator: ":")
    process.environment = environment
    process.standardOutput = pipe
    process.standardError = pipe
    try process.run()
    let output = pipe.fileHandleForReading.readDataToEndOfFile()
    process.waitUntilExit()
    if process.terminationStatus != 0 {
        let message = (try? JSONSerialization.jsonObject(with: output) as? [String: String])?["error"] ?? String(data: output, encoding: .utf8) ?? "Assistant setup failed."
        throw NSError(domain: "ProjectCAD", code: Int(process.terminationStatus), userInfo: [NSLocalizedDescriptionKey: message])
    }
    return output
}

@MainActor
final class CompanionModel: ObservableObject {
    @Published var settings = CompanionSettings()
    @Published var status: CompanionStatus?
    @Published var busy = false
    @Published var message = "Starting the local assistant…"
    @Published var failure = false
    @Published var showSettings = false
    private var refreshing = false

    init() { loadSettings() }
    func refresh() {
        guard !busy, !refreshing, !showSettings else { return }
        refreshing = true
        DispatchQueue.global(qos: .utility).async {
            let data = try? control(["status"])
            DispatchQueue.main.async {
                self.refreshing = false
                guard !self.busy, !self.showSettings, let data,
                      let status = try? JSONDecoder().decode(CompanionStatus.self, from: data) else { return }
                self.status = status
                self.settings.agents = status.agents
            }
        }
    }
    func loadSettings() {
        settings = CompanionSettings()
        let path = dataDirectory.appendingPathComponent("settings.json")
        if let data = try? Data(contentsOf: path), let value = try? JSONDecoder().decode(CompanionSettings.self, from: data) { settings = value }
    }
    func perform(_ action: String, arguments: [String] = [], completion: ((Data) -> Void)? = nil) {
        guard !busy else { return }
        busy = true; failure = false
        message = action.contains("connection") ? "Saving your decision…" : action == "stop" ? "Stopping the assistant…" : action == "status" ? "Checking the assistant…" : "Starting the assistant…"
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                let data = try control([action] + arguments)
                DispatchQueue.main.async {
                    self.busy = false
                    if let status = try? JSONDecoder().decode(CompanionStatus.self, from: data) { self.status = status; self.message = status.message; self.settings.agents = status.agents }
                    completion?(data)
                }
            } catch { DispatchQueue.main.async { self.busy = false; self.failure = true; self.message = error.localizedDescription } }
        }
    }
    @discardableResult func save() -> Bool {
        guard let url = URL(string: settings.websiteUrl), url.user == nil, url.password == nil,
              url.scheme == "https" || (url.scheme == "http" && ["localhost", "127.0.0.1", "::1"].contains(url.host ?? "")) else {
            failure = true; message = "Enter an HTTPS Project CAD address or a localhost address."; return false
        }
        do {
            try FileManager.default.createDirectory(at: dataDirectory, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
            let path = dataDirectory.appendingPathComponent("settings.json")
            if let data = try? Data(contentsOf: path), let latest = try? JSONDecoder().decode(CompanionSettings.self, from: data) { settings.agents = latest.agents }
            try JSONEncoder().encode(settings).write(to: path, options: .atomic)
            try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: path.path)
            showSettings = false
            perform("restart")
            return true
        } catch { failure = true; message = "Settings could not be saved. \(error.localizedDescription)"; return false }
    }
    func setup(_ provider: String) {
        guard !busy else { return }
        busy = true; failure = false
        message = "Preparing \(provider == "codex" ? "Codex" : "Claude Code"). Missing software will be downloaded from its official package."
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                let result = try control(["install-provider", provider])
                guard let value = try JSONSerialization.jsonObject(with: result) as? [String: Any], let binary = value["path"] as? String else { throw NSError(domain: "ProjectCAD", code: 1) }
                let quote = "'" + binary.replacingOccurrences(of: "'", with: "'\\''") + "'"
                let command = quote + (provider == "codex" ? " login" : " auth login")
                let escaped = command.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"")
                let script = "tell application \"Terminal\"\nactivate\ndo script \"\(escaped)\"\nend tell"
                DispatchQueue.main.async {
                    var error: NSDictionary?
                    NSAppleScript(source: script)?.executeAndReturnError(&error)
                    self.busy = false
                    if let error { self.failure = true; self.message = "Could not open sign-in. \(error)" }
                    else { self.message = "Complete \(provider == "codex" ? "Codex" : "Claude Code") sign-in, then return to Project CAD." }
                }
            } catch { DispatchQueue.main.async { self.busy = false; self.failure = true; self.message = error.localizedDescription } }
        }
    }
    func openProject() {
        if let url = URL(string: settings.websiteUrl) { NSWorkspace.shared.open(url) }
    }
}

struct CompanionView: View {
    @StateObject private var model = CompanionModel()
    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            HStack(spacing: 13) {
                Image(systemName: "point.3.connected.trianglepath.dotted").font(.system(size: 30, weight: .medium)).foregroundStyle(accent)
                VStack(alignment: .leading, spacing: 3) {
                    Text("Project CAD").font(.system(size: 25, weight: .semibold))
                    Text("Your local assistant").foregroundStyle(.secondary)
                }
                Spacer()
                HStack(spacing: 6) { Circle().fill(model.status?.running == true ? accent : Color.secondary).frame(width: 7, height: 7); Text(model.status?.running == true ? "Running" : model.settings.agents == nil ? "Setup" : "Stopped").font(.caption) }
            }
            if let request = model.status?.connections?.first {
                Text("Connect this website?").font(.title2.weight(.semibold))
                Text(request.origin).font(.body.weight(.medium)).textSelection(.enabled).fixedSize(horizontal: false, vertical: true)
                Text(request.agents.providers.map { agentNames[$0] ?? $0 }.joined(separator: ", ")).foregroundStyle(.secondary)
                Text("Allow access to the selected agents and this computer’s project conversation history. Project changes still require your review.").foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                HStack {
                    Button("Decline") { model.perform("deny-connection", arguments: [request.id]) }.disabled(model.busy)
                    Spacer()
                    Button("Approve connection") { model.perform("approve-connection", arguments: [request.id]) }.buttonStyle(.borderedProminent).tint(accent).disabled(model.busy)
                }
            } else if model.settings.agents == nil {
                Text("Connect from Project CAD").font(.title2.weight(.semibold))
                Text("Choose your agents on the website, then connect. Connection requests appear here.").foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            } else {
                Text("Your agents").font(.title2.weight(.semibold))
                Text("Agent choices are managed on the website. Existing sign-ins are reused.").foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                ForEach(model.settings.agents?.providers ?? [], id: \.self) { id in
                    if id == "muse" {
                        HStack {
                            VStack(alignment: .leading, spacing: 4) { Text("Muse").fontWeight(.medium); Text(model.status?.museConfigured == true ? "API key configured. Access is checked when you send a message." : "Add your Muse API key.").font(.caption).foregroundStyle(.secondary) }
                            Spacer(); Button("Configure") { model.showSettings = true }.disabled(model.busy)
                        }
                    } else {
                        provider(agentNames[id]!, detail: (model.settings.agents?.providers.count ?? 0) > 1 && model.settings.agents?.preferred == id ? "Default agent" : "", available: id == "codex" ? model.status?.codexAvailable == true : model.status?.claudeAvailable == true) { model.setup(id) }
                    }
                }
            }
            if model.status?.connections?.first == nil { HStack {
                Spacer()
                Button("Open Project CAD", action: model.openProject).buttonStyle(.borderedProminent).tint(accent).controlSize(.large)
            } }
            Divider()
            HStack(alignment: .top, spacing: 10) {
                if model.busy { ProgressView().controlSize(.small) }
                Text(model.message).font(.caption).foregroundStyle(model.failure ? Color.red : Color.secondary).textSelection(.enabled).fixedSize(horizontal: false, vertical: true)
            }.frame(minHeight: 32, alignment: .topLeading)
            HStack {
                Button("Settings…") { model.showSettings = true }.disabled(model.busy)
                Button("Open logs") { NSWorkspace.shared.open(dataDirectory.appendingPathComponent("logs")) }
                Spacer()
                Group {
                    Button(model.status?.running == true ? "Stop assistant" : "Start assistant") { model.perform(model.status?.running == true ? "stop" : "start") }.disabled(model.busy || (model.status?.running == true && model.status?.managed == false))
                }
                Button { model.perform("status") } label: { Image(systemName: "arrow.clockwise") }.help("Refresh connection").disabled(model.busy)
            }
        }
        .padding(28).frame(width: 550).background(Color(nsColor: .windowBackgroundColor))
        .onAppear { model.perform("start") }
        .onReceive(Timer.publish(every: 3, on: .main, in: .common).autoconnect()) { _ in model.refresh() }
        .sheet(isPresented: $model.showSettings) {
            VStack(alignment: .leading, spacing: 18) {
                Text("Assistant settings").font(.title2.weight(.semibold))
                VStack(alignment: .leading, spacing: 6) { Text("Project CAD website").font(.caption); TextField("https://projectcad.vercel.app", text: $model.settings.websiteUrl) }
                Toggle("Start assistant when I log in", isOn: $model.settings.startAtLogin)
                VStack(alignment: .leading, spacing: 6) { Text("Muse API key").font(.caption); SecureField("API key", text: $model.settings.museApiKey); Text("Stored in your private local assistant settings.").font(.caption2).foregroundStyle(.secondary) }
                if model.failure { Text(model.message).font(.caption).foregroundStyle(.red).fixedSize(horizontal: false, vertical: true) }
                HStack { Button("Cancel") { model.loadSettings(); model.showSettings = false }; Spacer(); Button("Save settings") { model.save() }.buttonStyle(.borderedProminent).tint(accent) }
            }.padding(25).frame(width: 440)
        }
    }
    func provider(_ title: String, detail: String, available: Bool, action: @escaping () -> Void) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) { Text(title).fontWeight(.medium); if !detail.isEmpty { Text(detail).font(.caption).foregroundStyle(.secondary) } }
            Spacer(); Button(available ? "Manage sign-in" : "Set up", action: action).disabled(model.busy)
        }
    }
}

@main
struct ProjectCADAssistant: App {
    init() {
        if CommandLine.arguments.contains("--diagnostics") {
            do { let output = try control(["doctor"]); FileHandle.standardOutput.write(output); exit(0) }
            catch { fputs("\(error.localizedDescription)\n", stderr); exit(1) }
        }
    }
    var body: some Scene {
        Window("Project CAD Assistant", id: "assistant") { CompanionView() }
            .windowResizability(.contentSize)
            .commands { CommandGroup(replacing: .newItem) {} }
    }
}
