# ADR-0007 — Docker, deployed on AWS ECS Fargate

**Status:** Docker: Accepted · AWS/ECS: Proposed (assumption A3) · 2026-10-25

## Decision
Package as a Docker image (one image, `APP_MODE` selects `api|realtime|worker`). Deploy to **ECS Fargate** behind an ALB, with RDS Postgres, ElastiCache Redis, S3 + CloudFront. Infra as code with Terraform. See [infra](../08-infra-and-operations.md).

## Consequences
- ✅ Fargate = no servers to patch; autoscaling per service; works with WebSockets via ALB.
- ✅ Access to AWS-native building blocks (SES, Rekognition, Secrets Manager, GitHub OIDC).
- ⚠️ More setup than a PaaS; Terraform learning/maintenance.
- ⚠️ NAT gateway and Multi-AZ data services add fixed monthly cost.

## Alternatives
Fly.io / Render / Railway + managed Postgres (fastest to start, cheaper at tiny scale; weaker VPC/IAM story) — **fallback** if setup time or cost blocks launch. Kubernetes (EKS) — unjustified operational load at this scale.
