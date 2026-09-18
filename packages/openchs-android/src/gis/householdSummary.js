import _ from "lodash";
import moment from "moment";
import {structureKey} from "./structureNumber";
import {answerIndex, answerLabels, combinedAnswerLabel} from "./observationAnswers";

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
