using backend.Data;
using global::backend.Data;
using Microsoft.EntityFrameworkCore;

namespace backend.Services
{
    public class LocationHistoryCleanupService : BackgroundService
    {
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly ILogger<LocationHistoryCleanupService> _logger;

        public LocationHistoryCleanupService(
            IServiceScopeFactory scopeFactory,
            ILogger<LocationHistoryCleanupService> logger)
        {
            _scopeFactory = scopeFactory;
            _logger = logger;
        }

        protected override async Task ExecuteAsync(
            CancellationToken stoppingToken)
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    using var scope = _scopeFactory.CreateScope();

                    var context = scope.ServiceProvider
                        .GetRequiredService<AppDbContext>();

                    var expirationDate = DateTimeOffset.UtcNow.AddDays(-7);

                    var deletedCount = await context.LocationHistory
                        .Where(l => l.RecordedAt < expirationDate)
                        .ExecuteDeleteAsync(stoppingToken);

                    _logger.LogInformation(
                        "Удалено старых записей истории: {Count}",
                        deletedCount);
                }
                catch (OperationCanceledException)
                    when (stoppingToken.IsCancellationRequested)
                {
                    break;
                }
                catch (Exception ex)
                {
                    _logger.LogError(
                        ex,
                        "Ошибка при очистке истории геолокации.");
                }

                await Task.Delay(
                    TimeSpan.FromHours(24),
                    stoppingToken);
            }
        }
    }
}
