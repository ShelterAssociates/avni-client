import _ from "lodash";
import moment from "moment";
import {structureKey} from "./structureNumber";
import {answerIndex, answerLabels, combinedAnswerLabel} from "./observationAnswers";

// The newest registrations of one slum, for the screen that stands in for the map when the
// latest sync brought no structures to tap.
export function recentHouseholds(subjects, limit = 10) {
    return _(_.toArray(subjects))
        .orderBy([subject => subject.registrationDate ? new Date(subject.registrationDate).getTime() : 0], ["desc"])
        .take(limit)
        .map(subject => ({
            uuid: subject.uuid,
            number: structureKey(subject.firstName),
            name: _.trim(subject.lastName) || "",
            registeredOn: subject.registrationDate ? moment(subject.registrationDate).format("YYYY-MM-DD") : null,
        }))
        .value();
}

// Shelter's registration form keeps the house number in firstName, so the person is lastName.
export function householdSummary(individual, concepts, conceptService) {
    const index = answerIndex(individual);
    const answers = _.compact(_.map(concepts, concept => {
        const value = combinedAnswerLabel(answerLabels(index[concept.uuid], conceptService));
        return value ? {label: concept.name, value} : null;
    }));
    return {
        name: _.trim(individual.lastName) || "",
        number: structureKey(individual.firstName),
        registeredOn: individual.registrationDate ? moment(individual.registrationDate).format("YYYY-MM-DD") : null,
        answers,
    };
}
