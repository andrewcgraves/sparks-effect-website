.PHONY: install test typecheck build run dev lint clean dev-workflow tour-fixture

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

# Re-freezes the plot the How it works tour draws (src/fixtures/tourSample.json)
# from the production API. Needs network; run it when the network or the router
# changes what a plot looks like.
tour-fixture: install
	node scripts/snapshot-tour-fixture.ts

clean:
	rm -rf node_modules dist

# PROTOTYPE (SPA-462): the embed route against the staging API, proxied through
# Vite so the browser sees one origin. Open /prototype/embed-host. Throwaway.
prototype-embed: install
	PROTOTYPE_API_PROXY=https://sparks-effect-api-staging.up.railway.app VITE_API_BASE_URL= npm run dev -- --host
