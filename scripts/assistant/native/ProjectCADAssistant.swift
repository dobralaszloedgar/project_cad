import Cocoa
import SwiftUI

private let accent = Color(red: 0.16, green: 0.43, blue: 0.35)
private let dataDirectory = ProcessInfo.processInfo.environment["PROJECT_CAD_ASSISTANT_DATA"].map { URL(fileURLWithPath: $0, isDirectory: true) } ?? FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".project-cad/assistant", isDirectory: true)

private let agentNames = ["muse": "Muse Code"]
struct AgentSelection: Codable {
    var providers: [String]
    var preferred: String
}
struct CompanionSettings: Codable {
    var websiteUrl = "https://projectcad.vercel.app"
    var startAtLogin = true
    var museApiKey = ""
    var agents: AgentSelection? = AgentSelection(providers: ["muse"], preferred: "muse")
    enum CodingKeys: String, CodingKey { case websiteUrl, startAtLogin, museApiKey, agents }
    init() {}
    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        websiteUrl = try values.decodeIfPresent(String.self, forKey: .websiteUrl) ?? websiteUrl
        startAtLogin = try values.decodeIfPresent(Bool.self, forKey: .startAtLogin) ?? startAtLogin
        museApiKey = try values.decodeIfPresent(String.self, forKey: .museApiKey) ?? museApiKey
        agents = AgentSelection(providers: ["muse"], preferred: "muse")
    }
}
struct CompanionStatus: Decodable {
    var running: Bool
    var managed: Bool
    var museAvailable: Bool
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
    private var attemptedSetup = Set<String>()
    private var waitingSignIns = Set<String>()
    @Published var readyAgents = Set<String>()

    init() { loadSettings() }
    func refresh() {
        guard !busy, !refreshing, !showSettings else { return }
        refreshing = true
        let waiting = Array(waitingSignIns)
        DispatchQueue.global(qos: .utility).async {
            let data = try? control(["status"])
            let signedIn = waiting.filter { id in
                guard let result = try? control(["provider-status", id]), let value = try? JSONSerialization.jsonObject(with: result) as? [String: Any] else { return false }
                return value["available"] as? Bool == true
            }
            DispatchQueue.main.async {
                self.refreshing = false
                guard !self.busy, !self.showSettings, let data,
                      let status = try? JSONDecoder().decode(CompanionStatus.self, from: data) else { return }
                self.status = status
                self.readyAgents.formUnion(signedIn)
                self.waitingSignIns.subtract(signedIn)
                if !signedIn.isEmpty && self.waitingSignIns.isEmpty { self.message = "Ready." }
                self.settings.agents = status.agents
                self.prepareNextAgent()
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
    func prepareNextAgent() {
        guard !busy, let next = settings.agents?.providers.first(where: { !attemptedSetup.contains($0) }) else { return }
        attemptedSetup.insert(next)
        setup(next)
    }
    func setup(_ provider: String) {
        guard !busy else { return }
        attemptedSetup.insert(provider)
        readyAgents.remove(provider)
        waitingSignIns.remove(provider)
        busy = true; failure = false
        message = "Preparing Muse…"
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                let result = try control(["prepare-provider", provider])
                guard let value = try JSONSerialization.jsonObject(with: result) as? [String: Any], let binary = value["path"] as? String else { throw NSError(domain: "ProjectCAD", code: 1) }
                if value["ready"] as? Bool == true {
                    DispatchQueue.main.async { self.readyAgents.insert(provider); self.busy = false; self.message = "Ready."; self.prepareNextAgent() }
                    return
                }
                let quote = "'" + binary.replacingOccurrences(of: "'", with: "'\\''") + "'"
                let command = quote + " login"
                let escaped = command.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"")
                let script = "tell application \"Terminal\"\nactivate\ndo script \"\(escaped)\"\nend tell"
                DispatchQueue.main.async {
                    var error: NSDictionary?
                    NSAppleScript(source: script)?.executeAndReturnError(&error)
                    self.busy = false
                    if let error { self.failure = true; self.message = "Could not open sign-in. \(error)" }
                    else { self.waitingSignIns.insert(provider); self.message = "Complete \(agentNames[provider] ?? provider) sign-in, then return to Project CAD."; self.prepareNextAgent() }
                }
            } catch { DispatchQueue.main.async { self.busy = false; self.failure = true; self.message = error.localizedDescription; self.prepareNextAgent() } }
        }
    }
    func openProject() {
        guard let url = URL(string: settings.websiteUrl),
              let application = NSWorkspace.shared.urlForApplication(toOpen: url),
              let bundle = Bundle(url: application)?.bundleIdentifier else { return }
        let running = NSRunningApplication.runningApplications(withBundleIdentifier: bundle).first
        let target = (url.scheme ?? "https") + "://" + (url.host ?? "") + (url.port.map { ":\($0)" } ?? "") + "/workspace"
        let escaped = target.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"")
        if running != nil && ["com.apple.Safari", "com.google.Chrome", "com.microsoft.edgemac", "com.brave.Browser"].contains(bundle) {
            let select = bundle == "com.apple.Safari" ? "set current tab of w to tab i of w" : "set active tab index of w to i"
            let script = """
            tell application id "\(bundle)"
                repeat with w in windows
                    repeat with i from 1 to count of tabs of w
                        if (URL of tab i of w) starts with "\(escaped)" then
                            \(select)
                            set index of w to 1
                            activate
                            return true
                        end if
                    end repeat
                end repeat
                return false
            end tell
            """
            var error: NSDictionary?
            if NSAppleScript(source: script)?.executeAndReturnError(&error).booleanValue == true { return }
            // If automation is unavailable, activate the existing browser rather
            // than opening another project tab.
            if error != nil { running?.activate(options: [.activateAllWindows]); return }
        } else if let running { running.activate(options: [.activateAllWindows]); return }
        NSWorkspace.shared.open(url)
    }

}

struct CompanionView: View {
    @StateObject private var model = CompanionModel()
    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            HStack(spacing: 13) {
                Image(nsImage: NSApplication.shared.applicationIconImage).resizable().frame(width: 42, height: 42)
                VStack(alignment: .leading, spacing: 3) {
                    Text("Project CAD").font(.system(size: 25, weight: .semibold))
                    Text("Muse connector").foregroundStyle(.secondary)
                }
                Spacer()
                HStack(spacing: 6) { Circle().fill(model.status?.running == true ? accent : Color.secondary).frame(width: 7, height: 7); Text(model.status?.running == true ? "Running" : model.settings.agents == nil ? "Setup" : "Stopped").font(.caption) }
            }
            if let request = model.status?.connections?.first {
                Text("Connect this website?").font(.title2.weight(.semibold))
                Text(request.origin).font(.body.weight(.medium)).textSelection(.enabled).fixedSize(horizontal: false, vertical: true)
                Text(request.agents.providers.map { agentNames[$0] ?? $0 }.joined(separator: ", ")).foregroundStyle(.secondary)

                HStack {
                    Button("Decline") { model.perform("deny-connection", arguments: [request.id]) }.disabled(model.busy)
                    Spacer()
                    Button("Approve connection") { model.perform("approve-connection", arguments: [request.id]) }.buttonStyle(.borderedProminent).tint(accent).disabled(model.busy)
                }
            } else {
                provider("Muse Code", detail: model.readyAgents.contains("muse") ? "Ready" : "Preparing Muse…", available: model.readyAgents.contains("muse")) { model.setup("muse") }
            }
            if model.status?.connections?.first == nil { HStack {
                Spacer()
                Button("Return to project", action: model.openProject).buttonStyle(.borderedProminent).tint(accent).controlSize(.large)
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
                if model.failure { Text(model.message).font(.caption).foregroundStyle(.red).fixedSize(horizontal: false, vertical: true) }
                HStack { Button("Cancel") { model.loadSettings(); model.showSettings = false }; Spacer(); Button("Save settings") { model.save() }.buttonStyle(.borderedProminent).tint(accent) }
            }.padding(25).frame(width: 440)
        }
    }
    func provider(_ title: String, detail: String, available: Bool, action: @escaping () -> Void) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) { Text(title).fontWeight(.medium); if !detail.isEmpty { Text(detail).font(.caption).foregroundStyle(.secondary) } }
            Spacer(); if !available { Button("Sign in", action: action).disabled(model.busy) }
        }
    }
}

@main
struct ProjectCADAssistant: App {
    init() {
        if let option = CommandLine.arguments.firstIndex(of: "--quit-for-update") {
            guard option + 1 < CommandLine.arguments.count else {
                fputs("Choose the installed app to update.\n", stderr); exit(1)
            }
            let destination = URL(fileURLWithPath: CommandLine.arguments[option + 1]).standardizedFileURL.resolvingSymlinksInPath()
            let previous = NSRunningApplication.runningApplications(withBundleIdentifier: "com.projectcad.assistant.app").filter {
                $0.processIdentifier != ProcessInfo.processInfo.processIdentifier &&
                $0.bundleURL?.standardizedFileURL.resolvingSymlinksInPath() == destination
            }
            for application in previous { application.terminate() }
            let deadline = Date().addingTimeInterval(10)
            while previous.contains(where: { !$0.isTerminated }) && Date() < deadline {
                RunLoop.current.run(until: Date().addingTimeInterval(0.1))
            }
            if previous.contains(where: { !$0.isTerminated }) {
                fputs("Close Project CAD Assistant before updating.\n", stderr); exit(1)
            }
            exit(0)
        }
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
