using backend.Services;
using backend.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using Swashbuckle.AspNetCore.SwaggerUI;
using System.Text;
using System.Security.Cryptography;
using System.Text.Json.Serialization;

var builder = WebApplication.CreateBuilder(args);

// Временная проверка API-ключа для старых API-маршрутов.
var apiKey = builder.Configuration["ApiKey"];
if (string.IsNullOrWhiteSpace(apiKey))
{
    throw new InvalidOperationException(
        "ApiKey is not configured. Set the ApiKey environment variable.");
}

// Настройки JWT.
var jwtKey = builder.Configuration["Jwt:Key"];
var jwtIssuer = builder.Configuration["Jwt:Issuer"];
var jwtAudience = builder.Configuration["Jwt:Audience"];

if (string.IsNullOrWhiteSpace(jwtKey) ||
    string.IsNullOrWhiteSpace(jwtIssuer) ||
    string.IsNullOrWhiteSpace(jwtAudience))
{
    throw new InvalidOperationException(
        "JWT configuration is incomplete. Set Jwt:Key, Jwt:Issuer and Jwt:Audience.");
}

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(
                Encoding.UTF8.GetBytes(jwtKey)),

            ValidateIssuer = true,
            ValidIssuer = jwtIssuer,

            ValidateAudience = true,
            ValidAudience = jwtAudience,

            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromSeconds(30)
        };
    });

builder.Services.AddAuthorization();

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

builder.Services.Configure<Microsoft.AspNetCore.Http.Json.JsonOptions>(options =>
{
    options.SerializerOptions.NumberHandling = JsonNumberHandling.Strict;
});

// OpenAPI.
builder.Services.AddOpenApi();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.UseSwaggerUI(options =>
    {
        options.SwaggerEndpoint("/openapi/v1.json", "v1");
    });
}

// Публичная проверка состояния сервера.
app.MapGet("/health", () => Results.Ok(new { status = "ok" }));

// Временная проверка API-ключа для старых маршрутов.
// /api/auth освобождён от неё: там будет использоваться JWT.
app.Use(async (context, next) =>
{
    var isApiRoute = context.Request.Path.StartsWithSegments("/api");
    var isAuthRoute = context.Request.Path.StartsWithSegments("/api/auth");

    if (isApiRoute && !isAuthRoute)
    {
        var providedKey = context.Request.Headers["X-Api-Key"].ToString();
        var expectedBytes = Encoding.UTF8.GetBytes(apiKey);
        var providedBytes = Encoding.UTF8.GetBytes(providedKey);

        bool isValid =
            providedBytes.Length == expectedBytes.Length &&
            CryptographicOperations.FixedTimeEquals(
                providedBytes, expectedBytes);

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

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

// Применение миграций при запуске.
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.Migrate();
}

app.Run();
