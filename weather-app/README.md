# Live Weather Android foundation

```text
app/src/main/java/com/example/liveweather/
├── data/
│   ├── model/WeatherData.kt
│   ├── remote/WeatherApi.kt
│   └── repository/WeatherRepository.kt
├── ui/
│   ├── theme/
│   └── weather/WeatherScreen.kt
├── viewmodel/WeatherViewModel.kt
└── MainActivity.kt
```

Map your Retrofit DTOs to `WeatherData` in the repository, expose that state from `WeatherViewModel`, and pass it to `WeatherScreen`.
