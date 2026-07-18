.PHONY: install test typecheck build run lint clean dev-workflow

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

# Non-interactive check an agent can run end-to-end: lint, typecheck, test, and
# build, without starting a long-running server.
dev-workflow: lint typecheck test build

clean:
	rm -rf node_modules dist
