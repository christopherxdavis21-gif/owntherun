import Foundation
import Capacitor
import CoreMotion

/**
 * CMPedometer bridge for Own The Run.
 *
 * GPS accuracy collapses when the phone is in a pocket — fabric and body mass
 * block the sky view, so iOS starts emitting coarse fixes we have to discard.
 * The motion coprocessor keeps counting steps and estimating distance the whole
 * time, on dedicated low-power silicon that stays awake while the app itself is
 * suspended. That makes it the correct source of truth for bridging GPS gaps.
 *
 * Usage from JS:
 *   OwnTheRunPedometer.start()      -> begins accumulating from "now"
 *   OwnTheRunPedometer.getDistance() -> { available, distance, steps }
 *   OwnTheRunPedometer.stop()
 *
 * `distance` is cumulative metres since start(), not a delta — the JS layer
 * diffs it so a missed poll can never lose mileage.
 */
@objc(OwnTheRunPedometerPlugin)
public class OwnTheRunPedometerPlugin: CAPPlugin {
    private let pedometer = CMPedometer()
    private var startDate: Date?

    /// Latest cumulative values, updated on the CoreMotion queue.
    private var latestDistance: Double = 0
    private var latestSteps: Int = 0
    private let lock = NSLock()

    @objc func start(_ call: CAPPluginCall) {
        guard CMPedometer.isDistanceAvailable() || CMPedometer.isStepCountingAvailable() else {
            call.resolve(["available": false])
            return
        }

        let now = Date()
        startDate = now

        lock.lock()
        latestDistance = 0
        latestSteps = 0
        lock.unlock()

        // Live updates keep the values fresh while the app is foregrounded.
        pedometer.startUpdates(from: now) { [weak self] data, error in
            guard let self = self, let data = data, error == nil else { return }
            self.lock.lock()
            self.latestDistance = data.distance?.doubleValue ?? self.latestDistance
            self.latestSteps = data.numberOfSteps.intValue
            self.lock.unlock()
        }

        call.resolve(["available": true])
    }

    @objc func getDistance(_ call: CAPPluginCall) {
        guard let start = startDate else {
            call.resolve(["available": false, "distance": 0, "steps": 0])
            return
        }

        // Query explicitly rather than trusting the live stream: while the app
        // was suspended the update callback never fired, but CoreMotion has
        // still been recording, and the query returns that backfilled data.
        pedometer.queryPedometerData(from: start, to: Date()) { [weak self] data, error in
            guard let self = self else { return }

            if let data = data, error == nil {
                self.lock.lock()
                let distance = data.distance?.doubleValue ?? self.latestDistance
                let steps = data.numberOfSteps.intValue
                self.latestDistance = distance
                self.latestSteps = steps
                self.lock.unlock()

                call.resolve([
                    "available": true,
                    "distance": distance,
                    "steps": steps,
                ])
                return
            }

            self.lock.lock()
            let distance = self.latestDistance
            let steps = self.latestSteps
            self.lock.unlock()

            call.resolve([
                "available": true,
                "distance": distance,
                "steps": steps,
            ])
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        pedometer.stopUpdates()
        startDate = nil
        call.resolve()
    }
}
