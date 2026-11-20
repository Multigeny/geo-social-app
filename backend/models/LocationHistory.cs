namespace backend.models
{
    public class LocationHistory
    {
        public int Id { get; set; }

        public int UserId { get; set; }

        public double Latitude { get; set; }

        public double Longitude { get; set; }

        public double? Accuracy { get; set; }

        public DateTimeOffset RecordedAt { get; set; }
            = DateTimeOffset.UtcNow;

        public User? User { get; set; }
    }
}