using backend.Services;
using backend.Data;
using Microsoft.EntityFrameworkCore;
using Swashbuckle.AspNetCore.SwaggerUI;
using System.Text;
using System.Security.Cryptography;
using System.Text.Json.Serialization;


var builder = WebApplication.CreateBuilder(args);

// Получаем API-ключ из конфигурации или переменных окружения.
var apiKey = builder.Configuration["ApiKey"];

if (string.IsNullOrWhiteSpace(apiKey))
{
    throw new InvalidOperationException(
        "ApiKey is not configured. Set the ApiKey environment variable.");
}

// Подключение к PostgreSQL.
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(
        builder.Configuration.GetConnectionString("DefaultConnection")));
        
builder.Services.AddHostedService<LocationHistoryCleanupService>();

// Настройка JSON.
builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.NumberHandling =
            JsonNumberHandling.Strict;
    });

builder.Services.Configure<
    Microsoft.AspNetCore.Http.Json.JsonOptions>(options =>
{
    options.SerializerOptions.NumberHandling =
        JsonNumberHandling.Strict;
});

// OpenAPI.
builder.Services.AddOpenApi();

var app = builder.Build();

// Swagger доступен только в Development.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();

    app.UseSwaggerUI(options =>
    {
        options.SwaggerEndpoint("/openapi/v1.json", "v1");
    });
}

// Проверка доступности API.
// Этот адрес не требует API-ключа.
app.MapGet("/health", () =>
{
    return Results.Ok(new { status = "ok" });
});

// Проверка API-ключа для всех маршрутов /api.
app.Use(async (context, next) =>
{
    if (context.Request.Path.StartsWithSegments("/api"))
    {
        var providedKey =
            context.Request.Headers["X-Api-Key"].ToString();

        var expectedBytes = Encoding.UTF8.GetBytes(apiKey);
        var providedBytes = Encoding.UTF8.GetBytes(providedKey);

        bool isValid =
            providedBytes.Length == expectedBytes.Length &&
            CryptographicOperations.FixedTimeEquals(
                providedBytes,
                expectedBytes);

        if (!isValid)
        {
            context.Response.StatusCode = 401;

            await context.Response.WriteAsJsonAsync(new
            {
                error = "Invalid or missing API key"
            });

            return;
        }
    }

    await next();
});

if (!app.Environment.IsDevelopment())
{
    app.UseHttpsRedirection();
}

app.UseAuthorization();

app.MapControllers();

// Применение миграций базы данных при запуске.
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.Migrate();
}

app.Run();
