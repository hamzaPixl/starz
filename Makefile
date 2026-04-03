.PHONY: install dev sync serve build-web test clean

install:
	pip install -e .

dev:
	pip install -e ".[dev]"

sync:
	starz sync

serve:
	starz serve

build-web:
	cd web && bun run build && cp -r out/ ../src/starz/static/

test:
	pytest tests/ -v

clean:
	rm -rf dist/ *.egg-info/ src/starz/static/
