using backend.Data;
using backend.models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace backend.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    [Authorize]
    public class LocationsController : ControllerBase
    {
        private readonly AppDbContext _context;

        public LocationsController(AppDbContext context)
        {
            _context = context;
        }

        // POST: api/locations
        [HttpPost]
        public async Task<ActionResult<CurrentLocation>> CreateLocation(
            CreateLocationRequest request)
        {
            var userIdClaim = User.FindFirstValue(ClaimTypes.NameIdentifier);

            if (!int.TryParse(userIdClaim, out var userId) || userId <= 0)
                return Unauthorized("Не удалось определить пользователя.");

            if (request.Latitude < -90 || request.Latitude > 90)
                return BadRequest("Некорректная широта.");

            if (request.Longitude < -180 || request.Longitude > 180)
                return BadRequest("Некорректная долгота.");

            if (request.Accuracy < 0)
                return BadRequest("Некорректная точность GPS.");

            var now = DateTimeOffset.UtcNow;

            var currentLocation = await _context.CurrentLocations
                .FirstOrDefaultAsync(l => l.UserId == userId);

            if (currentLocation == null)
            {
                currentLocation = new CurrentLocation
                {
                    UserId = userId,
                    Latitude = request.Latitude,
                    Longitude = request.Longitude,
                    Accuracy = request.Accuracy,
                    RecordedAt = now
                };

                _context.CurrentLocations.Add(currentLocation);
            }
            else
            {
                currentLocation.Latitude = request.Latitude;
                currentLocation.Longitude = request.Longitude;
                currentLocation.Accuracy = request.Accuracy;
                currentLocation.RecordedAt = now;
            }

            var latestHistory = await _context.LocationHistory
                .Where(l => l.UserId == userId)
                .OrderByDescending(l => l.RecordedAt)
                .FirstOrDefaultAsync();

            if (latestHistory == null ||
                now - latestHistory.RecordedAt >= TimeSpan.FromMinutes(5))
            {
                var historyLocation = new LocationHistory
                {
                    UserId = userId,
                    Latitude = request.Latitude,
                    Longitude = request.Longitude,
                    Accuracy = request.Accuracy,
                    RecordedAt = now
                };

                _context.LocationHistory.Add(historyLocation);
            }

            await _context.SaveChangesAsync();

            return Ok(currentLocation);
        }

        // GET: api/locations/current
        [HttpGet("current")]
        public async Task<ActionResult<List<CurrentLocationResponse>>>
            GetCurrentLocations()
        {
            var locations = await _context.CurrentLocations
                .Select(l => new CurrentLocationResponse
                {
                    UserId = l.UserId,
                    Latitude = l.Latitude,
                    Longitude = l.Longitude,
                    Accuracy = l.Accuracy,
                    RecordedAt = l.RecordedAt
                })
                .ToListAsync();

            return Ok(locations);
        }

        // GET: api/locations/history/3
        [HttpGet("history/{userId}")]
        public async Task<ActionResult<List<LocationHistoryResponse>>>
            GetLocationHistory([FromRoute] int userId)
        {
            var currentUserIdClaim =
                User.FindFirstValue(ClaimTypes.NameIdentifier);

            if (!int.TryParse(currentUserIdClaim, out var currentUserId))
                return Unauthorized();

            if (userId != currentUserId)
                return Forbid();

            var historyStart = DateTimeOffset.UtcNow.AddDays(-7);

            var history = await _context.LocationHistory
                .Where(l =>
                    l.UserId == currentUserId &&
                    l.RecordedAt >= historyStart)
                .OrderBy(l => l.RecordedAt)
                .Select(l => new LocationHistoryResponse
                {
                    UserId = l.UserId,
                    Latitude = l.Latitude,
                    Longitude = l.Longitude,
                    Accuracy = l.Accuracy,
                    RecordedAt = l.RecordedAt
                })
                .ToListAsync();

            return Ok(history);
        }
    }

    public class CreateLocationRequest
    {
        public double Latitude { get; set; }

        public double Longitude { get; set; }

        public double? Accuracy { get; set; }
    }

    public class CurrentLocationResponse
    {
        public int UserId { get; set; }

        public double Latitude { get; set; }

        public double Longitude { get; set; }

        public double? Accuracy { get; set; }

        public DateTimeOffset RecordedAt { get; set; }
    }

    public class LocationHistoryResponse
    {
        public int UserId { get; set; }

        public double Latitude { get; set; }

        public double Longitude { get; set; }

        public double? Accuracy { get; set; }

        public DateTimeOffset RecordedAt { get; set; }
    }
}
