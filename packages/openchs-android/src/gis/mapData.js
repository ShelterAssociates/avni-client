// Builds everything MapPickerScreen shows for one slum from the households
// registered there: the survey-status map, the list of filters that make
// sense for this slum and this user, and the answer map for one filter.
// Pure functions over plain objects so they are unit-tested without Realm.
import {Concept, Privilege} from "avni-models";
import _ from "lodash";
import {structureKey} from "./structureNumber";
import {answerIndex, combinedAnswerLabel, hasAnswer, valueLabeller} from "./observationAnswers";
import {assignAnswerColors, duplicateLabel, orderAnswerLabels} from "./colorCoding";
import {presetAnswerColors} from "./filterColors";

export const DUPLICATES_FILTER_KEY = "__duplicates__";

export const STATUS = {registered: "registered", duplicate: "duplicate"};

// {structureKey: {status, uuids, count}} for the subjects of one slum. Two or
// more households on the same house number (two workers registering the same
// house offline, then both syncing) is a duplicate.
export function buildStatusMap(subjects) {
    const byKey = {};
    _.forEach(subjects, subject => {
        const key = structureKey(subject.firstName);
        if (!key) return;
        if (!byKey[key]) byKey[key] = {status: STATUS.registered, uuids: [], count: 0};
        byKey[key].uuids.push(subject.uuid);
        byKey[key].count++;
        if (byKey[key].count > 1) byKey[key].status = STATUS.duplicate;
    });
    return byKey;
}

export function duplicateCount(statusMap) {
    return _.filter(statusMap, entry => entry.status === STATUS.duplicate).length;
}

// Whether this user's groups may see the answers of this subject type at
// all. Without it the map still shows registered/not-surveyed (needed to
// avoid duplicates) but offers no answer filters.
export function canViewSubjectType(privilegeService, subjectType) {
    if (privilegeService.hasAllPrivileges()) return true;
    const criteria = `privilege.name = '${Privilege.privilegeName.viewSubject}' AND privilege.entityType = '${Privilege.privilegeEntityType.subject}'`;
    return _.includes(privilegeService.allowedEntityTypeUUIDListForCriteria(criteria, "subjectTypeUuid"), subjectType.uuid);
}

// Coded questions of the form (top-level only: answers inside question
// groups are nested in their group's observation and are not searched here).
export function codedConceptsOnForm(form) {
    if (_.isNil(form)) return [];
    return _(form.getFormElementsOfType(Concept.dataType.Coded))
        .filter(formElement => _.isNil(formElement.groupUuid) && !_.isNil(formElement.concept))
        .map(formElement => formElement.concept)
        .uniqBy("uuid")
        .value();
}

export function codedConceptsOnForms(forms) {
    return _.uniqBy(_.flatMap(forms, codedConceptsOnForm), "uuid");
}

const nextTick = () => new Promise(resolve => setTimeout(resolve, 0));

// Every household's raw answers to the given concepts, read from Realm once (in chunks, yielding to the
// UI) so filters can be applied over and over without touching Realm again. Visits are only read when a
// concept lives outside the registration form.
export async function answerTable(subjects, concepts, {chunk = 100, yieldFn = nextTick, registrationOnly = false} = {}) {
    const table = [];
    for (let start = 0; start < subjects.length; start += chunk) {
        if (start > 0) await yieldFn();
        _.forEach(subjects.slice(start, start + chunk), subject => {
            const index = answerIndex(subject, {registrationOnly});
            const values = {};
            _.forEach(concepts, concept => {
                const observation = index[concept.uuid];
                if (hasAnswer(observation)) values[concept.uuid] = observation.getValueWrapper().getValue();
            });
            table.push({key: structureKey(subject.firstName), values});
        });
    }
    return table;
}

function countAnswers(table) {
    const counts = {};
    _.forEach(table, ({values}) => _.forEach(values, (value, uuid) => { counts[uuid] = (counts[uuid] || 0) + 1; }));
    return counts;
}

// The filters to offer for this slum: one per coded question that at least
// one household here has answered (in form order), plus a duplicates filter
// when there are any. `canViewAnswers` false hides the concept filters.
// {filters, table}: the filters to offer (see above) and the answer table they were counted from, which
// applyFilter reuses.
export async function buildFilterCatalog({concepts, subjects, statusMap, canViewAnswers = true, mapFilters = [], registrationConcepts = []}) {
    const filters = [];
    let table = [];
    const duplicates = duplicateCount(statusMap);
    if (duplicates > 0) {
        filters.push({key: DUPLICATES_FILTER_KEY, label: "Duplicates", kind: "duplicates", count: duplicates});
    }
    if (canViewAnswers) {
        const chosen = chosenConcepts(concepts, mapFilters);
        const registrationOnly = _.every(chosen, concept => _.some(registrationConcepts, {uuid: concept.uuid}));
        table = await answerTable(subjects, chosen, {registrationOnly});
        const counts = countAnswers(table);
        _.forEach(chosen, concept => {
            const count = counts[concept.uuid] || 0;
            if (count > 0) filters.push({key: concept.uuid, label: concept.name, kind: "concept", concept, count});
        });
    }
    return {filters, table};
}

// The GIS server's admin-chosen filters (get_structures_for_avni "map_filters"), in its order; none chosen = every concept.
function chosenConcepts(concepts, mapFilters) {
    if (_.isEmpty(mapFilters)) return concepts;
    const norm = text => _.toLower(_.trim(text));
    return _.compact(mapFilters.map(({concept_uuid, concept_name}) =>
        _.find(concepts, c => c.uuid === concept_uuid) || _.find(concepts, c => norm(c.name) === norm(concept_name))));
}

function conceptAnswerNames(concept, conceptService) {
    return _(concept.answers)
        .sortBy(answer => _.isNil(answer.answerOrder) ? Number.MAX_SAFE_INTEGER : answer.answerOrder)
        .map(answer => {
            const uuid = _.get(answer, "concept.uuid");
            const answerConcept = uuid && conceptService.getConceptByUUID(uuid);
            return answerConcept ? answerConcept.name : _.get(answer, "concept.name");
        })
        .compact()
        .value();
}

// {answerByKey: {structureKey: label}, answerColors: {label: colour}} for a
// concept filter. A structure with several households takes the first
// household's answer.
export function applyConceptFilter({table, concept, conceptService, filterStyles = []}) {
    const answerByKey = {};
    const labels = valueLabeller(concept, conceptService);
    _.forEach(table, ({key, values}) => {
        if (!key || _.has(answerByKey, key)) return;
        const label = combinedAnswerLabel(labels(values[concept.uuid]));
        if (label) answerByKey[key] = label;
    });
    const ordered = orderAnswerLabels(_.values(answerByKey), conceptAnswerNames(concept, conceptService));
    return {answerByKey, answerColors: assignAnswerColors(ordered, presetAnswerColors(filterStyles, concept.name))};
}

// Same shape for the built-in duplicates filter: label = how many households
// share the number, so a legend row per count.
export function applyDuplicateFilter(statusMap) {
    const answerByKey = {};
    _.forEach(statusMap, (entry, key) => {
        if (entry.status === STATUS.duplicate) answerByKey[key] = duplicateLabel(entry.count);
    });
    const ordered = _.sortBy(_.uniq(_.values(answerByKey)), label => parseInt(label, 10));
    return {answerByKey, answerColors: assignAnswerColors(ordered)};
}

export function applyFilter(filter, {table, conceptService, statusMap, filterStyles}) {
    if (filter.kind === "duplicates") return applyDuplicateFilter(statusMap);
    return applyConceptFilter({table, concept: filter.concept, conceptService, filterStyles});
}
