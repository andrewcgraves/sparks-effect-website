.PHONY: install test typecheck build run dev lint clean dev-workflow

NODE_MODULES := node_modules/.install-stamp

install: $(NODE_MODULES)

$(NODE_MODULES): package.json package-lock.json
	npm install
	@touch $(NODE_MODULES)

test: install
	npm run test

typecheck: install
	npm run typecheck

lint: install
	npm run lint

build: install
	npm run build

run: build
	npm run preview

# Long-running Vite dev server with hot module reloading for active
# development. Binds all interfaces so it is reachable outside the container.
dev: install
	npm run dev -- --host

# Non-interactive check an agent can run end-to-end: lint, typecheck, test, and
# build, without starting a long-running server.
dev-workflow: lint typecheck test build

clean:
	rm -rf node_modules dist
