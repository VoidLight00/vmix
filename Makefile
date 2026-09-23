.DEFAULT_GOAL := help
.PHONY: help test verify install

help: ## list targets
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  %-8s %s\n",$$1,$$2}'

test: ## run the offline test suite
	node --test tests/*.test.mjs

verify: ## run every HARD gate (exit 0 = ready to publish)
	bash gates/verify_vmix.sh .

install: ## install vmix for the current user (pass PROXY_HOST=... for a remote proxy)
	./install.sh $(if $(PROXY_HOST),--proxy-host $(PROXY_HOST),)
