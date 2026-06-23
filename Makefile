# === Docker ===

up:
	docker compose up -d

down:
	docker compose down

restart:
	docker compose down && docker compose up -d

rebuild:
	docker compose build api web && docker compose up -d

logs:
	docker compose logs -f

logs-api:
	docker compose logs -f api

logs-web:
	docker compose logs -f web

ps:
	docker compose ps

seed:
	docker compose run --rm seed

# Xoá toàn bộ data MongoDB (cẩn thận!)
nuke:
	docker compose down -v

# === Dev (local, không Docker) ===

install:
	npm install

dev-api:
	npm run dev:api

dev-web:
	npm run dev:web

build:
	npm run build

# === Tiện ích ===

# Kết nối MongoDB shell
mongo-shell:
	docker compose exec mongo mongosh vs-cms

# Xem số lượng jobs
jobs-count:
	docker compose exec mongo mongosh vs-cms --eval 'db.jobs.countDocuments()'

# Xem jobs đang chạy
jobs-running:
	docker compose exec mongo mongosh vs-cms --eval 'db.jobs.find({status:"running"}).toArray()'

# Xem jobs thất bại
jobs-failed:
	docker compose exec mongo mongosh vs-cms --eval 'db.jobs.find({status:"failed"}).sort({createdAt:-1}).limit(5).toArray()'

# Xem số websites
websites-count:
	docker compose exec mongo mongosh vs-cms --eval 'db.websites.countDocuments()'

.PHONY: up down restart rebuild logs logs-api logs-web ps seed nuke install dev-api dev-web build mongo-shell jobs-count jobs-running jobs-failed websites-count
