import _ from "lodash";
import GisConfig from "./GisConfig";

// Every synced Slum is one the worker is assigned to (sync is catchment-scoped).
export function mapEntry(addressLevelService) {
    const slums = _.sortBy(addressLevelService.findAllByCriteria("type = 'Slum' AND voided = false")
        .map(a => ({uuid: a.uuid, name: a.name})), "name");
    return {slums, available: GisConfig.isConfigured() && !_.isEmpty(slums)};
}
