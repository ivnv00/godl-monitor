import Foundation
import Combine
import GODLCore

@MainActor
final class GoalsController: ObservableObject {
    @Published private(set) var library = GoalLibrary()
    @Published private(set) var identity: String?
    @Published private(set) var error: String?
    private let store: GoalStore
    private var readable = true

    init(directory: URL) {
        store = GoalStore(directory: directory)
        do { library = try store.load() }
        catch {
            readable = false
            self.error = "Saved goals couldn’t be read. The file has been preserved."
        }
    }

    var canEdit: Bool { readable && identity != nil }
    var all: [MonitorGoal] { identity.flatMap { library.goalsByIdentity[$0] } ?? [] }
    var active: [MonitorGoal] { all.filter { !$0.isArchived } }
    var archived: [MonitorGoal] { all.filter(\.isArchived) }
    var pinned: [MonitorGoal] { active.filter(\.showsInWidget) }

    func configure(_ monitor: MonitorView) {
        let key = [monitor.wallet, monitor.provenance.genesisHash, monitor.provenance.programAddress].joined(separator: ":")
        if identity != key { identity = key }
        guard readable, library.goalsByIdentity[key] == nil else { return }
        let target: String
        switch monitor.goal {
        case .observed(let goal): target = goal.targetGodl
        case .unavailable(let goal): target = goal.targetGodl
        }
        do {
            var candidate = library
            try candidate.seed(identity: key, target: target)
            try commit(candidate)
        } catch { self.error = "The initial goal couldn’t be saved. Try again after the next refresh." }
    }

    func save(_ goal: MonitorGoal) throws {
        guard canEdit, let identity else { throw CocoaError(.fileWriteNoPermission) }
        var candidate = library
        var list = candidate.goalsByIdentity[identity] ?? []
        if let index = list.firstIndex(where: { $0.id == goal.id }) { list[index] = goal }
        else { list.append(goal) }
        candidate.goalsByIdentity[identity] = list
        try commit(candidate)
    }

    func pin(_ goal: MonitorGoal) {
        update(goal, pinned: !goal.showsInWidget, archived: goal.isArchived)
    }

    func archive(_ goal: MonitorGoal) {
        update(goal, pinned: goal.showsInWidget, archived: !goal.isArchived)
    }

    func move(_ goal: MonitorGoal, by offset: Int) {
        guard canEdit, let identity, let visibleIndex = active.firstIndex(where: { $0.id == goal.id }) else { return }
        let next = visibleIndex + offset
        guard active.indices.contains(next),
              let index = all.firstIndex(where: { $0.id == goal.id }),
              let nextIndex = all.firstIndex(where: { $0.id == active[next].id }) else { return }
        var candidate = library
        candidate.goalsByIdentity[identity]?.swapAt(index, nextIndex)
        try? commit(candidate)
    }

    private func update(_ goal: MonitorGoal, pinned: Bool, archived: Bool) {
        do {
            try save(MonitorGoal(id: goal.id, title: goal.title, metric: goal.metric,
                                 target: goal.target, showsInWidget: pinned, isArchived: archived,
                                 visualStyle: goal.visualStyle))
        } catch { self.error = "Goal changes couldn’t be saved. Your previous goals are unchanged." }
    }

    private func commit(_ candidate: GoalLibrary) throws {
        do {
            try store.save(candidate)
            library = candidate
            error = nil
        } catch {
            self.error = "Goal changes couldn’t be saved. Your previous goals are unchanged."
            throw error
        }
    }
}
