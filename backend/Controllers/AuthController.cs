
using backend.Data;
using backend.models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;

namespace backend.Controllers
{
    [Route("api/auth")]
    [ApiController]
    public class AuthController : ControllerBase
    {
        private readonly AppDbContext _context;
        private readonly IPasswordHasher<User> _passwordHasher;
        private readonly IConfiguration _configuration;

        public AuthController(
            AppDbContext context,
            IPasswordHasher<User> passwordHasher,
            IConfiguration configuration)
        {
            _context = context;
            _passwordHasher = passwordHasher;
            _configuration = configuration;
        }

        // POST: api/auth/register
        [HttpPost("register")]
        public async Task<IActionResult> Register(RegisterRequest request)
        {
            var name = request.Name?.Trim();
            var email = request.Email?.Trim().ToLowerInvariant();
            var password = request.Password;

            if (string.IsNullOrWhiteSpace(name))
                return BadRequest(new { error = "Имя обязательно." });

            if (string.IsNullOrWhiteSpace(email))
                return BadRequest(new { error = "Email обязателен." });

            if (string.IsNullOrWhiteSpace(password) || password.Length < 8)
                return BadRequest(new { error = "Пароль должен содержать минимум 8 символов." });

            var emailExists = await _context.Users
                .AnyAsync(u => u.Email == email);

            if (emailExists)
                return Conflict(new { error = "Пользователь с таким email уже существует." });

            var user = new User
            {
                Name = name,
                Email = email
            };

            user.PasswordHash = _passwordHasher.HashPassword(user, password);

            _context.Users.Add(user);
            await _context.SaveChangesAsync();

            var token = GenerateJwtToken(user);

            return Ok(new AuthResponse
            {
                UserId = user.Id,
                Name = user.Name,
                Email = user.Email,
                Token = token
            });
        }

        // POST: api/auth/login
        [HttpPost("login")]
        public async Task<IActionResult> Login(LoginRequest request)
        {
            var email = request.Email?.Trim().ToLowerInvariant();

            if (string.IsNullOrWhiteSpace(email) ||
                string.IsNullOrWhiteSpace(request.Password))
            {
                return BadRequest(new { error = "Email и пароль обязательны." });
            }

            var user = await _context.Users
                .FirstOrDefaultAsync(u => u.Email == email);

            if (user == null || string.IsNullOrEmpty(user.PasswordHash))
                return Unauthorized(new { error = "Неверный email или пароль." });

            var verificationResult = _passwordHasher.VerifyHashedPassword(
                user,
                user.PasswordHash,
                request.Password);

            if (verificationResult == PasswordVerificationResult.Failed)
                return Unauthorized(new { error = "Неверный email или пароль." });

            // Обновляем хеш, если алгоритм хеширования был улучшен.
            if (verificationResult == PasswordVerificationResult.SuccessRehashNeeded)
            {
                user.PasswordHash = _passwordHasher.HashPassword(
                    user, request.Password);

                await _context.SaveChangesAsync();
            }

            var token = GenerateJwtToken(user);

            return Ok(new AuthResponse
            {
                UserId = user.Id,
                Name = user.Name,
                Email = user.Email,
                Token = token
            });
        }

        private string GenerateJwtToken(User user)
        {
            var key = _configuration["Jwt:Key"]
                ?? throw new InvalidOperationException("JWT key is missing.");

            var issuer = _configuration["Jwt:Issuer"]
                ?? throw new InvalidOperationException("JWT issuer is missing.");

            var audience = _configuration["Jwt:Audience"]
                ?? throw new InvalidOperationException("JWT audience is missing.");

            var claims = new[]
            {
                new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
                new Claim(ClaimTypes.Name, user.Name),
                new Claim(ClaimTypes.Email, user.Email)
            };

            var signingKey = new SymmetricSecurityKey(
                Encoding.UTF8.GetBytes(key));

            var credentials = new SigningCredentials(
                signingKey,
                SecurityAlgorithms.HmacSha256);

            var token = new JwtSecurityToken(
                issuer: issuer,
                audience: audience,
                claims: claims,
                expires: DateTime.UtcNow.AddHours(1),
                signingCredentials: credentials);

            return new JwtSecurityTokenHandler().WriteToken(token);
        }
    }

    public class RegisterRequest
    {
        public string Name { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public string Password { get; set; } = string.Empty;
    }

    public class LoginRequest
    {
        public string Email { get; set; } = string.Empty;
        public string Password { get; set; } = string.Empty;
    }

    public class AuthResponse
    {
        public int UserId { get; set; }
        public string Name { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public string Token { get; set; } = string.Empty;
    }
}
