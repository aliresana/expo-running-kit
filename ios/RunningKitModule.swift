import ExpoModulesCore
import CoreLocation
import CoreMotion

public class RunningKitModule: Module {
    private let locationManager = CLLocationManager()
    private var locationDelegate: RunningKitLocationDelegate?
    
    private let pedometer = CMPedometer()
    private var sessionState = "idle"
    private var workoutStartTime: Date?
    private var totalDistance: Double = 0
    private var lastLocation: CLLocation?
    private var totalSteps: Int = 0
    private var pendingPermissionPromise: Promise?
    private var cadenceTimeoutTimer: Timer?
    private let cadenceTimeoutSeconds: TimeInterval = 3
    private var lastPedometerStepCount: Int = 0
    public func definition() -> ModuleDefinition {
        Name("RunningKit")
        
        Events("onLocationUpdate", "onStepUpdate", "onSessionStateChange")
        
        OnCreate {
            let delegate = RunningKitLocationDelegate(module: self)
            self.locationDelegate = delegate
            self.locationManager.delegate = delegate
            self.locationManager.desiredAccuracy = kCLLocationAccuracyBest
            self.locationManager.distanceFilter = kCLDistanceFilterNone
        }
        
        AsyncFunction("requestPermissions") { (promise: Promise) in
            let status = self.locationManager.authorizationStatus
            if status == .notDetermined {
                self.pendingPermissionPromise = promise
                self.locationManager.requestWhenInUseAuthorization()
            } else {
                promise.resolve(self.buildPermissionsResult(status: status))
            }
        }
        
        AsyncFunction("startWorkout") { (type: String, promise: Promise) in
            guard self.sessionState == "idle" || self.sessionState == "stopped" else {
                promise.reject("ERR_WORKOUT_ACTIVE", "A workout is already in progress")
                return
            }
            self.totalDistance = 0
            self.lastLocation = nil
            self.totalSteps = 0
            self.lastPedometerStepCount = 0
            self.workoutStartTime = Date()
            self.sessionState = "active"
            self.locationManager.startUpdatingLocation()
            self.startPedometerUpdates()
            self.sendEvent("onSessionStateChange", ["state": "active"])
            promise.resolve(nil)
        }
        
        Function("pauseWorkout") {
            guard self.sessionState == "active" else { return }
            self.sessionState = "paused"
            self.locationManager.stopUpdatingLocation()
            self.pedometer.stopUpdates()
            self.cadenceTimeoutTimer?.invalidate()
            self.cadenceTimeoutTimer = nil
            self.sendEvent("onSessionStateChange", ["state": "paused"])
        }
        
        Function("resumeWorkout") {
            guard self.sessionState == "paused" || self.sessionState == "auto-paused" else { return }
            let wasAutoPaused = self.sessionState == "auto-paused"
            self.sessionState = "active"
            self.locationManager.startUpdatingLocation()
            // Pedometer keeps running during auto-pause — restarting it resets currentCadence
            if !wasAutoPaused {
                self.startPedometerUpdates()
            }
            self.sendEvent("onSessionStateChange", ["state": "active"])
        }
        
        AsyncFunction("stopWorkout") { (promise: Promise) in
            guard self.sessionState == "active" || self.sessionState == "paused" || self.sessionState == "auto-paused" else {
                promise.reject("ERR_NO_WORKOUT", "No active workout to stop")
                return
            }
            self.locationManager.stopUpdatingLocation()
            self.pedometer.stopUpdates()
            self.cadenceTimeoutTimer?.invalidate()
            self.cadenceTimeoutTimer = nil
            self.sessionState = "stopped"
            let duration = self.workoutStartTime.map { Date().timeIntervalSince($0) } ?? 0
            self.sendEvent("onSessionStateChange", ["state": "stopped"])
            promise.resolve([
                "duration": duration,
                "distance": self.totalDistance,
                "steps": self.totalSteps,
                "avgSpeed": duration > 0 ? self.totalDistance / duration : 0,
                "calories": Double(self.totalSteps) * 0.04
            ])
        }
        
        
        Function("autoPauseWorkout") {
            guard self.sessionState == "active" else { return }
            self.sessionState = "auto-paused"
            self.locationManager.stopUpdatingLocation()
            self.sendEvent("onSessionStateChange", ["state": "auto-paused"])
        }
    }
    
    // MARK: - Location Handling
    
    func handleLocationUpdate(_ location: CLLocation) {
        guard sessionState == "active" else { return }
        if let last = lastLocation {
            totalDistance += location.distance(from: last)
        }
        lastLocation = location
        sendEvent("onLocationUpdate", [
            "latitude": location.coordinate.latitude,
            "longitude": location.coordinate.longitude,
            "altitude": location.altitude,
            "speed": max(location.speed, 0),
            "accuracy": location.horizontalAccuracy,
            "timestamp": location.timestamp.timeIntervalSince1970 * 1000
        ])
    }
    
    
    // MARK: - Permission Handling
    
    func handleAuthorizationChange(_ status: CLAuthorizationStatus) {
        guard let promise = pendingPermissionPromise else { return }
        promise.resolve(buildPermissionsResult(status: status))
        pendingPermissionPromise = nil
    }
    
    
    // MARK: - Helpers
    
    private func buildPermissionsResult(status: CLAuthorizationStatus) -> [String: String] {
        let locationStatus: String
        switch status {
        case .authorizedAlways, .authorizedWhenInUse: locationStatus = "granted"
        case .denied, .restricted: locationStatus = "denied"
        default: locationStatus = "undetermined"
        }
        return [
            "location": locationStatus,
            "motion": CMPedometer.isStepCountingAvailable() ? "granted" : "denied"
        ]
    }
    
    
    private func startPedometerUpdates() {
        guard CMPedometer.isStepCountingAvailable(), let start = workoutStartTime else { return }

        // startEventUpdates fires almost immediately when walking starts or stops.
        // This gives fast auto-resume without waiting for startUpdates to deliver cadence.
        if CMPedometer.isPedometerEventTrackingAvailable() {
            pedometer.startEventUpdates { [weak self] event, error in
                guard let self, let event, error == nil else { return }
                // Only handle resume — sends instant cadence signal for fast auto-resume.
                // Pause events are deliberately ignored: they fire during normal stride gaps
                // and cause false auto-pause triggers. The cadence timeout handles genuine stops.
                if event.type == .resume {
                    DispatchQueue.main.async { [weak self] in
                        guard let self else { return }
                        self.sendEvent("onStepUpdate", [
                            "steps": self.totalSteps,
                            "cadence": 60.0
                        ])
                    }
                }
            }
        }

        pedometer.startUpdates(from: start) { [weak self] data, error in
            guard let self, let data, error == nil else { return }
            let currentStepCount = data.numberOfSteps.intValue
            let stepsIncreased = currentStepCount > self.lastPedometerStepCount
            self.lastPedometerStepCount = currentStepCount
            self.totalSteps = currentStepCount

            let cadence: Double
            if let raw = data.currentCadence?.doubleValue, raw > 0 {
                cadence = raw * 60
            } else if stepsIncreased {
                cadence = 60.0
            } else {
                cadence = 0
            }

            DispatchQueue.main.async { [weak self] in
                guard let self else { return }
                self.sendEvent("onStepUpdate", ["steps": self.totalSteps, "cadence": cadence])

                // Reset the timeout only when a real new step arrived.
                // currentCadence is a rolling average that stays non-zero for ~3s after stopping,
                // so using it to gate the timer would delay auto-pause significantly.
                if stepsIncreased {
                    self.cadenceTimeoutTimer?.invalidate()
                    let steps = self.totalSteps
                    self.cadenceTimeoutTimer = Timer.scheduledTimer(
                        withTimeInterval: self.cadenceTimeoutSeconds,
                        repeats: false
                    ) { [weak self] _ in
                        guard let self else { return }
                        self.sendEvent("onStepUpdate", ["steps": steps, "cadence": 0])
                    }
                }
            }
        }
    }
    
}

// A separate NSObject subclass is required because CLLocationManagerDelegate inherits
// from NSObjectProtocol, and ExpoModulesCore's Module class does not extend NSObject.
// MARK: - Location Delegate

    class RunningKitLocationDelegate: NSObject, CLLocationManagerDelegate {
        weak var module: RunningKitModule?
        
        init(module: RunningKitModule) {
            self.module = module
        }
        
        func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
            guard let location = locations.last else { return }
            module?.handleLocationUpdate(location)
        }
        
        func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
            module?.handleAuthorizationChange(manager.authorizationStatus)
        }
    }

