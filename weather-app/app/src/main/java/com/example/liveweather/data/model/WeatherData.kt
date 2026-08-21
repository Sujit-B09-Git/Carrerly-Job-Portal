package com.example.liveweather.data.model

/** UI-friendly representation of the current weather for one city. */
data class WeatherData(
    val cityName: String,
    val temperatureCelsius: Double,
    val condition: String,
    val humidityPercent: Int,
    val windSpeedKmh: Double,
    val feelsLikeCelsius: Double,
    val iconUrl: String
)

val previewWeather = WeatherData(
    cityName = "Ahmedabad",
    temperatureCelsius = 31.0,
    condition = "Sunny",
    humidityPercent = 48,
    windSpeedKmh = 14.0,
    feelsLikeCelsius = 33.0,
    iconUrl = ""
)
