"use client";

import { useRef } from "react";
import {
  type MutationFunction,
  type MutationKey,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useOperationFeedback } from "@/providers/toast-provider";

type InvalidateTarget<TData, TVariables> =
  | MutationKey
  | ((ctx: {
      data: TData;
      variables: TVariables;
      queryClient: ReturnType<typeof useQueryClient>;
    }) => Promise<void> | void);

type FeedbackConfig<TData, TVariables> = {
  id?: string | ((variables: TVariables) => string);
  title?: string | ((variables: TVariables) => string);
  loading: string | ((variables: TVariables) => string);
  success?: string | ((data: TData, variables: TVariables) => string);
  error?: string | ((error: unknown, variables: TVariables) => string);
};

function resolveValue<TValue, TVariables>(
  value: TValue | ((variables: TVariables) => TValue),
  variables: TVariables,
) {
  return typeof value === "function"
    ? (value as (variables: TVariables) => TValue)(variables)
    : value;
}

function resolveResultMessage<TData, TVariables>(
  value: string | ((data: TData, variables: TVariables) => string),
  data: TData,
  variables: TVariables,
) {
  return typeof value === "function"
    ? (value as (data: TData, variables: TVariables) => string)(data, variables)
    : value;
}

function resolveErrorMessage<TVariables>(
  value: string | ((error: unknown, variables: TVariables) => string),
  error: unknown,
  variables: TVariables,
) {
  return typeof value === "function"
    ? (value as (error: unknown, variables: TVariables) => string)(
        error,
        variables,
      )
    : value;
}

export function useAppMutation<TData, TVariables>({
  mutationFn,
  feedback,
  invalidate = [],
  onSuccess,
  onError,
}: {
  mutationFn: MutationFunction<TData, TVariables>;
  feedback?: FeedbackConfig<TData, TVariables>;
  invalidate?: InvalidateTarget<TData, TVariables>[];
  onSuccess?: (data: TData, variables: TVariables) => Promise<void> | void;
  onError?: (error: unknown, variables: TVariables) => Promise<void> | void;
}) {
  const queryClient = useQueryClient();
  const operation = useOperationFeedback();
  const operationIdRef = useRef<string | null>(null);

  return useMutation({
    mutationFn,
    onMutate: (variables) => {
      if (!feedback) return;
      const operationId =
        feedback.id == null
          ? `mutation:${Date.now()}`
          : resolveValue(feedback.id, variables);
      operationIdRef.current = operationId;
      operation.start({
        id: operationId,
        title:
          feedback.title == null
            ? undefined
            : resolveValue(feedback.title, variables),
        message: resolveValue(feedback.loading, variables),
      });
    },
    onSuccess: async (data, variables) => {
      if (feedback?.success && operationIdRef.current) {
        const message = resolveResultMessage(feedback.success, data, variables);
        operation.start({
          id: operationIdRef.current,
          title:
            feedback.title == null
              ? undefined
              : resolveValue(feedback.title, variables),
          message,
        }).succeed({
          title:
            feedback.title == null
              ? undefined
              : resolveValue(feedback.title, variables),
          message,
        });
      }
      for (const target of invalidate) {
        if (typeof target === "function") {
          await target({ data, variables, queryClient });
        } else {
          await queryClient.invalidateQueries({ queryKey: [...target] });
        }
      }
      await onSuccess?.(data, variables);
      operationIdRef.current = null;
    },
    onError: async (error, variables) => {
      if (feedback && operationIdRef.current) {
        const message = feedback.error
          ? resolveErrorMessage(feedback.error, error, variables)
          : "The operation could not be completed.";
        operation.start({
          id: operationIdRef.current,
          title:
            feedback.title == null
              ? undefined
              : resolveValue(feedback.title, variables),
          message,
        }).fail({
          title:
            feedback.title == null
              ? undefined
              : resolveValue(feedback.title, variables),
          message,
        });
      }
      await onError?.(error, variables);
      operationIdRef.current = null;
    },
  });
}
