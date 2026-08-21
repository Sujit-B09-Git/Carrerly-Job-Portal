package com.example.liveweather.ui.weather

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Air
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.Thermostat
import androidx.compose.material.icons.outlined.WaterDrop
import androidx.compose.material.icons.outlined.WbSunny
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.example.liveweather.data.model.WeatherData
import com.example.liveweather.data.model.previewWeather
import java.util.Locale

@Composable
fun WeatherScreen(
    weather: WeatherData?,
    isLoading: Boolean,
    errorMessage: String?,
    onSearch: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    var query by remember { mutableStateOf(weather?.cityName.orEmpty()) }
    Column(
        modifier = modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(20.dp)
    ) {
        OutlinedTextField(
            value = query,
            onValueChange = { query = it },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Search city") },
            leadingIcon = { Icon(Icons.Outlined.Search, contentDescription = null) },
            trailingIcon = {
                IconButton(onClick = { onSearch(query.trim()) }, enabled = query.isNotBlank()) {
                    Icon(Icons.Outlined.Search, contentDescription = "Search weather")
                }
            },
            singleLine = true
        )
        when {
            isLoading -> LoadingContent()
            errorMessage != null -> ErrorContent(errorMessage)
            weather != null -> WeatherContent(weather)
        }
    }
}

@Composable
private fun LoadingContent() = Column(
    modifier = Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally
) {
    CircularProgressIndicator()
    Spacer(Modifier.height(12.dp))
    Text("Loading weather…")
}

@Composable
private fun ErrorContent(message: String) = Text(
    text = message, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyLarge
)

@Composable
private fun WeatherContent(weather: WeatherData) {
    WeatherCard(weather)
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        WeatherMetric("Humidity", "${weather.humidityPercent}%", { Icon(Icons.Outlined.WaterDrop, null) }, Modifier.weight(1f))
        WeatherMetric("Wind", "${weather.windSpeedKmh.format()} km/h", { Icon(Icons.Outlined.Air, null) }, Modifier.weight(1f))
        WeatherMetric("Feels like", "${weather.feelsLikeCelsius.format()}°", { Icon(Icons.Outlined.Thermostat, null) }, Modifier.weight(1f))
    }
}

@Composable
private fun WeatherCard(weather: WeatherData) = Card(
    modifier = Modifier.fillMaxWidth(),
    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer),
    shape = RoundedCornerShape(28.dp)
) {
    Row(Modifier.padding(24.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(weather.cityName, style = MaterialTheme.typography.headlineSmall)
            Spacer(Modifier.height(8.dp))
            Text("${weather.temperatureCelsius.format()}°C", style = MaterialTheme.typography.displayLarge, fontWeight = FontWeight.Bold)
            Text(weather.condition, style = MaterialTheme.typography.titleMedium)
        }
        if (weather.iconUrl.isNotBlank()) {
            AsyncImage(weather.iconUrl, weather.condition, Modifier.size(96.dp), contentScale = ContentScale.Fit)
        } else {
            Icon(Icons.Outlined.WbSunny, weather.condition, Modifier.size(80.dp), tint = Color(0xFFFF9800))
        }
    }
}

@Composable
private fun WeatherMetric(label: String, value: String, icon: @Composable () -> Unit, modifier: Modifier = Modifier) = Card(
    modifier = modifier, shape = RoundedCornerShape(18.dp)
) {
    Column(Modifier.padding(vertical = 16.dp, horizontal = 10.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        icon()
        Spacer(Modifier.height(8.dp))
        Text(value, fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodyMedium)
        Text(label, style = MaterialTheme.typography.labelSmall)
    }
}

private fun Double.format(): String = String.format(Locale.US, "%.0f", this)

@Preview(showBackground = true)
@Composable
private fun WeatherScreenPreview() = MaterialTheme {
    WeatherScreen(previewWeather, isLoading = false, errorMessage = null, onSearch = {})
}
