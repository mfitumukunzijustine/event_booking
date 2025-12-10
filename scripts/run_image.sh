#!/usr/bin/env bash
set -u

IMAGE=${1:-"juju71652/event_booking:v1.0.0"}
CONTAINER_NAME=${2:-event_booking}
HOST_PORT=${3:-3000}

echo "Using image: $IMAGE"

# Ensure docker daemon is available
if ! docker version >/dev/null 2>&1; then
  echo "Docker doesn't appear to be available or the daemon isn't running. Run 'sudo systemctl start docker' or ensure Docker Desktop is running." >&2
  exit 2
fi

# Pull image
echo "Pulling $IMAGE..."
docker pull "$IMAGE" || { echo "docker pull failed" >&2; exit 3; }

# If a container with the same name exists, remove it
EXISTING=$(docker ps -a --filter "name=^/${CONTAINER_NAME}$" --format "{{.ID}}")
if [ -n "$EXISTING" ]; then
  echo "Removing existing container $CONTAINER_NAME ($EXISTING)"
  docker rm -f "$EXISTING" || true
fi

# Run container
echo "Starting container $CONTAINER_NAME -> http://localhost:${HOST_PORT} (container port 3000)"
CID=$(docker run -d --name "$CONTAINER_NAME" -p ${HOST_PORT}:3000 "$IMAGE" 2>&1) || {
  echo "docker run failed: $CID" >&2
  docker ps -a | sed -n '1,200p'
  exit 4
}

echo "Container started with ID: $CID"

# Tail logs in background
echo "Tailing logs (will show last 200 lines then follow). Press Ctrl-C to stop following logs." 
sleep 1

docker logs --tail 200 -f "$CID" &
LOG_PID=$!

# Wait for health endpoint to become available (timeout 30s)
HEALTH_URL="http://localhost:${HOST_PORT}/health"
TIMEOUT=30
COUNT=0
SLEEP=1

echo "Waiting up to ${TIMEOUT}s for ${HEALTH_URL} to return 200..."
while [ $COUNT -lt $TIMEOUT ]; do
  if curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL" | grep -q "200"; then
    echo "Health check OK"
    break
  fi
  COUNT=$((COUNT+SLEEP))
  sleep $SLEEP
done

if [ $COUNT -ge $TIMEOUT ]; then
  echo "Health endpoint did not return 200 within ${TIMEOUT}s." >&2
  echo "Showing container status and last 200 log lines:" 
  docker ps -a --filter "name=^/${CONTAINER_NAME}$" --format "table {{.ID}}\t{{.Names}}\t{{.Status}}\t{{.Image}}"
  docker logs --tail 200 "$CID" || true
  kill $LOG_PID 2>/dev/null || true
  exit 5
fi

# Show root endpoint
echo "Root / response:"
curl -i http://localhost:${HOST_PORT}/ || true

# Print a short success summary
echo "--- SUCCESS ---"
docker ps --filter "name=^/${CONTAINER_NAME}$" --format "table {{.ID}}\t{{.Names}}\t{{.Status}}\t{{.Image}}"

# Keep log follower running; user can Ctrl-C to stop
wait $LOG_PID
