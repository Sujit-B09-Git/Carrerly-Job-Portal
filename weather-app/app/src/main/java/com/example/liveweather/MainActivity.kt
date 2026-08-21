package com.example.liveweather

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.material3.MaterialTheme
import com.example.liveweather.data.model.previewWeather
import com.example.liveweather.ui.weather.WeatherScreen

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme {
                WeatherScreen(
                    weather = previewWeather,
                    isLoading = false,
                    errorMessage = null,
                    onSearch = { /* ViewModel.searchCity(it) */ }
                )
            }
        }
    }
}
