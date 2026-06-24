---
name: kmp-data-layer
description: "Kotlin data layer patterns: data classes in shared-core, repository pattern, StateFlow, CatalogService, and content wiring"
applies_to: [content, scaffold, screens]
load_when: injecting content data, adding new models, or wiring data to screens
---

# KMP Data Layer

> Content flows: JSON catalog -> CatalogService -> ContentRepository -> UI (Compose/SwiftUI). The shared-core module owns all data logic. Platform apps only consume repositories via ServiceLocator.

## Architecture overview

```
JSON / API
    |
CatalogService (implements CatalogSource interface)
    |
ContentRepository (caches + queries)
    |
ServiceLocator (provides singleton instances)
    |
UI Layer (MainActivity / SwiftUI views)
```

## Core data model: ContentItem

```kotlin
// shared-core/src/commonMain/kotlin/models/ContentItem.kt

data class ContentItem(
    val id: String,
    val title: String,
    val description: String? = null,
    val thumbnailUrl: String? = null,
    val contentType: ContentType,          // Video, Audio, Image, Mixed
    val metadata: ContentMetadata = ContentMetadata(),
    val isOfflineAvailable: Boolean = false,
    val lastAccessed: Long? = null,
    val focusable: Boolean = true,
    val collections: List<String> = emptyList(),
    val tags: List<String> = emptyList(),
    val priority: Int = 0,                 // Higher = more prominent in UI
    val videoUrl: String? = null,
)
```

### ContentMetadata

```kotlin
data class ContentMetadata(
    val genre: String? = null,
    val rating: String? = null,
    val releaseDate: String? = null,
    val duration: Long? = null,
    val director: String? = null,
    val cast: List<String> = emptyList(),
)
```

### ContentType enum

```kotlin
enum class ContentType { Video, Audio, Image, Mixed }
```

## Repository pattern

### Interface

```kotlin
// shared-core/src/commonMain/kotlin/repositories/ContentRepository.kt

interface ContentRepository {
    suspend fun getContentItems(limit: Int = 50, offset: Int = 0): Result<List<ContentItem>>
    suspend fun getContentItem(id: String): Result<ContentItem?>
    suspend fun searchContent(query: String): Result<List<ContentItem>>
    suspend fun markContentAccessed(contentId: String): Result<Unit>
}
```

### Implementation

`ContentRepositoryImpl` wraps a `CatalogSource` and adds:
- **Lazy loading:** catalog is fetched once, then cached in-memory
- **Thread safety:** `Mutex` protects the content map
- **Sorting:** items returned sorted by `priority` descending
- **Search:** filters by title, description, and tags (case-insensitive)

### Result type

```kotlin
sealed class Result<out T> {
    data class Success<T>(val data: T) : Result<T>()
    data class Error(val exception: Exception? = null, val message: String? = null) : Result<Nothing>()
}
```

UI code uses `onSuccess`/`onFailure` extension methods for clean handling.

## CatalogService — loading content

```kotlin
interface CatalogSource {
    suspend fun fetchCatalog(): Result<List<ContentItem>>
}
```

The default `CatalogService` implementation loads content from a JSON endpoint or bundled file. To wire custom content:

### Option 1: Replace the JSON source

Implement `CatalogSource` to read from your content.json:

```kotlin
class CustomCatalogSource(private val jsonString: String) : CatalogSource {
    override suspend fun fetchCatalog(): Result<List<ContentItem>> {
        return try {
            val items = Json.decodeFromString<List<ContentItem>>(jsonString)
            Result.Success(items)
        } catch (e: Exception) {
            Result.Error(e, "Failed to parse catalog")
        }
    }
}
```

### Option 2: Remote API via Ktor

```kotlin
class RemoteCatalogSource(private val client: HttpClient) : CatalogSource {
    override suspend fun fetchCatalog(): Result<List<ContentItem>> {
        return try {
            val items = client.get("https://api.example.com/catalog").body<List<ContentItem>>()
            Result.Success(items)
        } catch (e: Exception) {
            Result.Error(e, "Network request failed")
        }
    }
}
```

Ktor engines are platform-specific:
- Android: `ktor-client-okhttp`
- iOS: `ktor-client-darwin`

Both are declared in `shared-core/build.gradle.kts` under `androidMain` and `iosMain` source sets.

## ServiceLocator — dependency injection

```kotlin
// shared-core/src/commonMain/kotlin/di/ServiceLocator.kt

object ServiceLocator {
    fun configure(
        catalogSource: CatalogSource = CatalogService(),
        authProvider: AuthProvider = AuthProvider { _, _ -> false },
    ) { /* stores instances */ }

    fun contentRepository(): ContentRepository { /* lazy singleton */ }
    fun sessionManager(): SessionManager { /* lazy singleton */ }
    fun applicationManager(): TVApplicationManager { /* lazy singleton */ }
}
```

**Usage in Android TV app:**

```kotlin
class MainActivity : ComponentActivity() {
    private val contentRepository = ServiceLocator.contentRepository()

    override fun onCreate(savedInstanceState: Bundle?) {
        // Use contentRepository in composables via LaunchedEffect
    }
}
```

## Wiring content.json into the data layer

To inject a user's content manifest:

1. **Parse the JSON** into `List<ContentItem>` using kotlinx-serialization
2. **Create a CatalogSource** that returns the parsed list
3. **Configure ServiceLocator** before the UI starts:

```kotlin
// In Application.onCreate() or before setContent {}
val catalog = parseContentJson(jsonString)
ServiceLocator.configure(
    catalogSource = object : CatalogSource {
        override suspend fun fetchCatalog() = Result.Success(catalog)
    }
)
```

### Mapping user manifest shapes

If the user's JSON doesn't match ContentItem directly, write a transform:

```kotlin
fun transformUserContent(raw: UserManifest): List<ContentItem> {
    return raw.videos.map { video ->
        ContentItem(
            id = video.id,
            title = video.title,
            description = video.description,
            thumbnailUrl = video.thumbnail_url,
            contentType = ContentType.Video,
            videoUrl = video.stream_url,
            metadata = ContentMetadata(
                genre = video.genre,
                rating = video.rating,
                releaseDate = video.year,
            ),
            tags = video.tags ?: emptyList(),
        )
    }
}
```

## UI consumption pattern

```kotlin
@Composable
fun MainScreen() {
    var contentItems by remember { mutableStateOf<List<ContentItem>>(emptyList()) }
    var isLoading by remember { mutableStateOf(true) }

    LaunchedEffect(Unit) {
        contentRepository.getContentItems()
            .onSuccess { items ->
                contentItems = items
                isLoading = false
            }
            .onFailure { /* show error */ }
    }

    // Render contentItems grouped by genre
    val categories = contentItems.groupBy { it.metadata.genre ?: "Other" }
}
```

## Adding a new model

1. Create the data class in `shared-core/src/commonMain/kotlin/models/`
2. Add `@Serializable` annotation if it will be parsed from JSON
3. Create/update a repository interface and implementation
4. Wire it in `ServiceLocator`
5. Add contract tests in `shared-core/src/commonTest/`

## Anti-patterns

- **Putting data classes in the platform app.** Models belong in `shared-core/commonMain` so both platforms use the same types.
- **Calling suspend functions from composition directly.** Always wrap in `LaunchedEffect` or `rememberCoroutineScope().launch`.
- **Skipping the Result wrapper.** Bare try/catch in UI code mixes concerns. Repository returns `Result<T>`, UI handles `Success`/`Error`.
- **Mutating the content list at the UI level.** If you need user state (watchlist, progress), add a separate repository/store. Don't modify the catalog items.
- **Hardcoding content in composables.** All data flows through repositories. If you write `listOf(ContentItem(...))` in a screen, the next content swap requires hunting through UI code.
