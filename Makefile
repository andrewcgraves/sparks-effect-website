.PHONY: install test typecheck build run dev lint clean dev-workflow tour-fixture transit-agencies

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

# Regenerates the attribution page's agency list (src/legal/transitAgencies.ts)
# from a generation's gtfs-manifest.csv. Run it whenever `make cycle-tiles`
# moves production to a new generation; scripts/transit-agencies.ts has the
# kubectl command that exports the manifest.
transit-agencies: install
	npm run attribution:agencies -- "$(MANIFEST)" "$(GENERATION)"

clean:
	rm -rf node_modules dist
