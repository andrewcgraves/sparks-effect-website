.PHONY: install test build run lint clean

NODE_MODULES := node_modules/.install-stamp

install: $(NODE_MODULES)

$(NODE_MODULES): package.json package-lock.json
	npm install
	@touch $(NODE_MODULES)

test: install
	npm run test

lint: install
	npm run lint

build: install
	npm run build

run: build
	npm run preview

clean:
	rm -rf node_modules dist
