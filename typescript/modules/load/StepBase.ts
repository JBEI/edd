"use strict";

import * as Summary from "./Summary.tsx";

// steps all have a callback to signal when a step should update in parent state
export interface Props {
    // jumpToStep injected by StepZilla parent
    jumpToStep?: (index: number) => void;
    onUpdate: (step: string, stepState: any, callback?: () => void) => void;
    statusProps: Summary.StatusProps;
}

export interface Strings {
    errors?: Summary.ProblemMessage[];
    title: string;
    warnings?: Summary.ProblemMessage[];
}
