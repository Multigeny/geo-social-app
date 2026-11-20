
using backend.Data;
using backend.models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace backend.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
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
            if (request.UserId <= 0)
                return BadRequest("Некорректный UserId.");

            if (request.Latitude < -90 || request.Latitude > 90)
                return BadRequest("Некорректная широта.");

            if (request.Longitude < -180 || request.Longitude > 180)
                return BadRequest("Некорректная долгота.");

            if (request.Accuracy < 0)
                return BadRequest("Некорректная точность GPS.");

            var userExists = await _context.Users
                .AnyAsync(u => u.Id == request.UserId);

            if (!userExists)
                return NotFound("Пользователь не найден.");

            var now = DateTimeOffset.UtcNow;

            var currentLocation = await _context.CurrentLocations
                .FirstOrDefaultAsync(l => l.UserId == request.UserId);

            if (currentLocation == null)
            {
                currentLocation = new CurrentLocation
                {
                    UserId = request.UserId,
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
                .Where(l => l.UserId == request.UserId)
                .OrderByDescending(l => l.RecordedAt)
                .FirstOrDefaultAsync();

            if (latestHistory == null ||
                now - latestHistory.RecordedAt >= TimeSpan.FromMinutes(5))
            {
                var historyLocation = new LocationHistory
                {
                    UserId = request.UserId,
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
        public async Task<ActionResult<List<CurrentLocationResponse>>> GetCurrentLocations()
        {
            var locations = await _context.CurrentLocations
            .Select(l => new CurrentLocationResponse
            {
                UserId = l.UserId,
                Latitude = l.Latitude,
                Longitude = l.Longitude,
                Accuracy = l.Accuracy,
                RecordedAt = l.RecordedAt
            }).ToListAsync();

        return Ok(locations);
        }

        // GET: api/locations/history/1
        [HttpGet("history/{userId}")]
        public async Task<ActionResult<List<LocationHistory>>> GetLocationHistory(
            [FromRoute] int userId)
        {
            var historyStart = DateTimeOffset.UtcNow.AddDays(-7);

            var history = await _context.LocationHistory
                .Where(l =>
                    l.UserId == userId &&
                    l.RecordedAt >= historyStart)
                .OrderBy(l => l.RecordedAt)
                .ToListAsync();

            return Ok(history);
        }
    }

    public class CreateLocationRequest
    {
        public int UserId { get; set; }

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
}

