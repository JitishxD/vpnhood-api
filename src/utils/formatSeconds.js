const formatSeconds = (seconds) => {
  // Ensure seconds is a non-negative integer
  seconds = Math.max(0, parseInt(seconds, 10));

  const days = Math.floor(seconds / 86400); // 86400 seconds in a day
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  const formattedTime = [
    days > 0 ? String(days).padStart(2, "0") : "00",
    hours > 0 ? String(hours).padStart(2, "0") : "00",
    minutes > 0 ? String(minutes).padStart(2, "0") : "00",
    String(remainingSeconds).padStart(2, "0"),
  ];

  return formattedTime.join(":");
};

export default formatSeconds;
