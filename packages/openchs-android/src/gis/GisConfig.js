// Shelter Associates GIS server settings, injected into framework/Config.js by
// the Makefile (GIS_SERVER_URL / GIS_API_KEY make or environment variables).
import Config from "../framework/Config";
import _ from "lodash";

export const GIS_API_KEY_HEADER = "X-Avni-Gis-Key";

function trimmed(value) {
    return _.isString(value) ? value.trim() : "";
}

class GisConfig {
    static get serverUrl() {
        return _.trimEnd(trimmed(Config.GIS_SERVER_URL), "/");
    }

    static get apiKey() {
        return trimmed(Config.GIS_API_KEY);
    }

    // Both are needed: the server answers 401 without the key and 503 when it
    // has none configured, so a build without either can only fail.
    static isConfigured() {
        return !_.isEmpty(GisConfig.serverUrl) && !_.isEmpty(GisConfig.apiKey);
    }

    static url(path) {
        return `${GisConfig.serverUrl}${path}`;
    }

    // fetch() against the GIS server with the shared key attached.
    static fetch(path, options = {}) {
        const headers = {...(options.headers || {}), [GIS_API_KEY_HEADER]: GisConfig.apiKey};
        return fetch(GisConfig.url(path), {...options, headers});
    }
}

export default GisConfig;
