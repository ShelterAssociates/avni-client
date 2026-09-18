// Builds everything MapPickerScreen shows for one slum from the households
// registered there: the survey-status map, the list of filters that make
// sense for this slum and this user, and the answer map for one filter.
// Pure functions over plain objects so they are unit-tested without Realm.
import {Concept, Privilege} from "avni-models";
import _ from "lodash";
import {structureKey} from "./structureNumber";
import {answerLabels, combinedAnswerLabel, findObservation} from "./observationAnswers";
import {assignAnswerColors, duplicateLabel, orderAnswerLabels} from "./colorCoding";

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

function answeredCount(subjects, concept, conceptService) {
    return _.sumBy(subjects, subject =>
        _.isEmpty(answerLabels(findObservation(subject.observations, concept), conceptService)) ? 0 : 1);
}

// The filters to offer for this slum: one per coded question that at least
// one household here has answered (in form order), plus a duplicates filter
// when there are any. `canViewAnswers` false hides the concept filters.
export function buildFilterCatalog({concepts, subjects, conceptService, statusMap, canViewAnswers = true}) {
    const filters = [];
    const duplicates = duplicateCount(statusMap);
    if (duplicates > 0) {
        filters.push({key: DUPLICATES_FILTER_KEY, label: "Duplicates", kind: "duplicates", count: duplicates});
    }
    if (canViewAnswers) {
        _.forEach(concepts, concept => {
            const count = answeredCount(subjects, concept, conceptService);
            if (count > 0) filters.push({key: concept.uuid, label: concept.name, kind: "concept", concept, count});
        });
    }
    return filters;
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
export function applyConceptFilter({subjects, concept, conceptService}) {
    const answerByKey = {};
    _.forEach(subjects, subject => {
        const key = structureKey(subject.firstName);
        if (!key || _.has(answerByKey, key)) return;
        const label = combinedAnswerLabel(answerLabels(findObservation(subject.observations, concept), conceptService));
        if (label) answerByKey[key] = label;
    });
    const ordered = orderAnswerLabels(_.values(answerByKey), conceptAnswerNames(concept, conceptService));
    return {answerByKey, answerColors: assignAnswerColors(ordered)};
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

export function applyFilter(filter, {subjects, conceptService, statusMap}) {
    if (filter.kind === "duplicates") return applyDuplicateFilter(statusMap);
    return applyConceptFilter({subjects, concept: filter.concept, conceptService});
}
