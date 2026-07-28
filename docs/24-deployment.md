# Deployment Architecture — KHEL-O

## Overview

Infrastructure setup using Docker containerization, cloud hosting on AWS (Mumbai `ap-south-1` region), managed PostgreSQL, and CloudFront CDN.

---

## 1. Cloud Architecture (AWS India)

- **Compute:** AWS ECS Fargate (Serverless containers running FastAPI backend behind an ALB).
- **Database:** AWS RDS PostgreSQL (Multi-AZ deployment for production).
- **Cache:** AWS ElastiCache for Redis.
- **Media Storage:** AWS S3 Bucket + CloudFront CDN for café photos.
- **DNS & CDN:** CloudFront + Route53.

---

## 2. Docker Setup

### Dockerfile
```dockerfile
FROM python:3.11-slim

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```
