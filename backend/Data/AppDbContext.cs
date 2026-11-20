using backend.models;
using Microsoft.EntityFrameworkCore;

namespace backend.Data
{
    public class AppDbContext : DbContext
    {
        public AppDbContext(DbContextOptions<AppDbContext> options)
            : base(options)
        {
        }

        public DbSet<User> Users { get; set; }

        public DbSet<Location> Locations { get; set; }

        public DbSet<CurrentLocation> CurrentLocations { get; set; }

        public DbSet<LocationHistory> LocationHistory { get; set; }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            // У одного пользователя может быть только одна текущая позиция.
            modelBuilder.Entity<CurrentLocation>()
                .HasIndex(l => l.UserId)
                .IsUnique();

            // Индекс для быстрого получения истории пользователя.
            modelBuilder.Entity<LocationHistory>()
                .HasIndex(l => new { l.UserId, l.RecordedAt });

            // Связь текущей позиции с пользователем.
            modelBuilder.Entity<CurrentLocation>()
                .HasOne(l => l.User)
                .WithMany()
                .HasForeignKey(l => l.UserId)
                .OnDelete(DeleteBehavior.Cascade);

            // Связь истории с пользователем.
            modelBuilder.Entity<LocationHistory>()
                .HasOne(l => l.User)
                .WithMany()
                .HasForeignKey(l => l.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        }
    }
}
