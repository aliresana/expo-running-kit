package expo.modules.runningkit

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Handler
import android.os.Looper
import com.google.android.gms.location.*
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class RunningKitModule : Module() {

  // MARK: - Properties
  private lateinit var fusedLocationClient: FusedLocationProviderClient
  private lateinit var sensorManager: SensorManager
  private var stepSensor: Sensor? = null
  private var sessionState = "idle"
  private var workoutStartTime: Long = 0
  private var totalDistance: Double = 0.0
  private var lastLocation: android.location.Location? = null
  private var totalSteps: Int = 0
  private var initialStepCount: Int = -1

  // Cadence calculation
  private var lastStepCount: Int = 0
  private var lastStepTime: Long = 0
  private var cadenceWindowReset = true

  // Cadence timeout — fires cadence=0 if no steps arrive within threshold
  private val cadenceHandler = Handler(Looper.getMainLooper())
  private val cadenceTimeoutMs = 4000L
  private val cadenceTimeoutRunnable = Runnable {
    if (sessionState == "active" || sessionState == "auto-paused") {
      cadenceWindowReset = true
      sendEvent("onStepUpdate", mapOf(
        "steps" to totalSteps,
        "cadence" to 0
      ))
    }
  }

  // MARK: - Location Callback
  private val locationCallback = object : LocationCallback() {
    override fun onLocationResult(result: LocationResult) {
      val location = result.lastLocation ?: return
      if (sessionState != "active") return

      lastLocation?.let { totalDistance += it.distanceTo(location) }
      lastLocation = location

      sendEvent("onLocationUpdate", mapOf(
        "latitude" to location.latitude,
        "longitude" to location.longitude,
        "altitude" to location.altitude,
        "speed" to maxOf(location.speed.toDouble(), 0.0),
        "accuracy" to location.accuracy.toDouble(),
        "timestamp" to location.time.toDouble()
      ))
    }
  }

  // MARK: - Step Listener
  private val stepListener = object : SensorEventListener {
    override fun onSensorChanged(event: SensorEvent) {
      if (sessionState != "active" && sessionState != "auto-paused") return

      val stepCount = event.values[0].toInt()
      if (initialStepCount == -1) {
        initialStepCount = stepCount
        lastStepCount = stepCount
        lastStepTime = System.currentTimeMillis()
      }

      totalSteps = stepCount - initialStepCount

      val now = System.currentTimeMillis()
      val cadence: Double

      if (cadenceWindowReset) {
        // First step after a stop — start fresh window, use conservative estimate
        cadenceWindowReset = false
        lastStepCount = stepCount
        lastStepTime = now
        cadence = 60.0
      } else {
        val deltaSteps = stepCount - lastStepCount
        val deltaSeconds = (now - lastStepTime) / 1000.0
        cadence = if (deltaSeconds > 0) (deltaSteps / deltaSeconds) * 60.0 else 0.0
        lastStepCount = stepCount
        lastStepTime = now
      }

      // Reset cadence timeout on every real step event
      cadenceHandler.removeCallbacks(cadenceTimeoutRunnable)
      sendEvent("onStepUpdate", mapOf(
        "steps" to totalSteps,
        "cadence" to cadence
      ))

      // Schedule cadence=0 if no new steps arrive within timeout
      cadenceHandler.postDelayed(cadenceTimeoutRunnable, cadenceTimeoutMs)
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
  }

  // MARK: - Module Definition
  override fun definition() = ModuleDefinition {
    Name("RunningKit")

    Events("onLocationUpdate", "onStepUpdate", "onSessionStateChange")

    OnCreate {
      val context = appContext.reactContext ?: return@OnCreate
      fusedLocationClient = LocationServices.getFusedLocationProviderClient(context)
      sensorManager = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
      stepSensor = sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)
    }

    // MARK: - Permissions
    AsyncFunction("requestPermissions") { promise: Promise ->
      val context = appContext.reactContext ?: return@AsyncFunction
      val location = if (
        context.checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION) ==
        android.content.pm.PackageManager.PERMISSION_GRANTED
      ) "granted" else "denied"

      val motion = if (
        context.checkSelfPermission(android.Manifest.permission.ACTIVITY_RECOGNITION) ==
        android.content.pm.PackageManager.PERMISSION_GRANTED
      ) "granted" else "denied"

      promise.resolve(mapOf("location" to location, "motion" to motion))
    }

    // MARK: - Workout Control
    AsyncFunction("startWorkout") { type: String, promise: Promise ->
      if (sessionState != "idle" && sessionState != "stopped") {
        promise.reject("ERR_WORKOUT_ACTIVE", "A workout is already in progress", null)
        return@AsyncFunction
      }

      totalDistance = 0.0
      lastLocation = null
      totalSteps = 0
      initialStepCount = -1
      lastStepCount = 0
      lastStepTime = 0
      cadenceWindowReset = true
      workoutStartTime = System.currentTimeMillis()
      sessionState = "active"

      startLocationUpdates()
      startStepCounting()

      sendEvent("onSessionStateChange", mapOf("state" to "active"))
      promise.resolve(null)
    }

    Function("pauseWorkout") {
      if (sessionState != "active") return@Function
      sessionState = "paused"
      fusedLocationClient.removeLocationUpdates(locationCallback)
      sensorManager.unregisterListener(stepListener)
      cadenceHandler.removeCallbacks(cadenceTimeoutRunnable)
      sendEvent("onSessionStateChange", mapOf("state" to "paused"))
    }

    Function("resumeWorkout") {
      if (sessionState != "paused" && sessionState != "auto-paused") return@Function
      val wasManuallPaused = sessionState == "paused"
      sessionState = "active"

      startLocationUpdates()

      // Step sensor was stopped during manual pause but kept running during auto-pause
      if (wasManuallPaused) startStepCounting()

      sendEvent("onSessionStateChange", mapOf("state" to "active"))
    }

    // Auto-pause: stops GPS but keeps step sensor running for auto-resume detection
    Function("autoPauseWorkout") {
      if (sessionState != "active") return@Function
      sessionState = "auto-paused"
      fusedLocationClient.removeLocationUpdates(locationCallback)
      // Step sensor intentionally kept running to detect movement for auto-resume
      sendEvent("onSessionStateChange", mapOf("state" to "auto-paused"))
    }

    AsyncFunction("stopWorkout") { promise: Promise ->
      if (sessionState != "active" && sessionState != "paused" && sessionState != "auto-paused") {
        promise.reject("ERR_NO_WORKOUT", "No active workout to stop", null)
        return@AsyncFunction
      }

      fusedLocationClient.removeLocationUpdates(locationCallback)
      sensorManager.unregisterListener(stepListener)
      cadenceHandler.removeCallbacks(cadenceTimeoutRunnable)
      sessionState = "stopped"

      val duration = (System.currentTimeMillis() - workoutStartTime) / 1000.0
      val avgSpeed = if (duration > 0) totalDistance / duration else 0.0
      val calories = totalSteps * 0.04

      sendEvent("onSessionStateChange", mapOf("state" to "stopped"))
      promise.resolve(mapOf(
        "duration" to duration,
        "distance" to totalDistance,
        "steps" to totalSteps,
        "avgSpeed" to avgSpeed,
        "calories" to calories
      ))
    }
  }

  // MARK: - Helpers

  private fun startLocationUpdates() {
    val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 1000)
      .setMinUpdateDistanceMeters(0f)
      .build()
    fusedLocationClient.requestLocationUpdates(request, locationCallback, Looper.getMainLooper())
  }

  private fun startStepCounting() {
    stepSensor?.let {
      sensorManager.registerListener(stepListener, it, SensorManager.SENSOR_DELAY_NORMAL)
    }
  }
}
