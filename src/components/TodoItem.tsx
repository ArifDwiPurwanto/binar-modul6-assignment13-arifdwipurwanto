"use client";

import { useState } from "react";
import { Todo } from "@/lib/types";

interface TodoItemProps {
  todo: Todo;
  onUpdate: (todo: Todo) => void;
  onDelete: (id: number) => void;
  onStatusChange: (id: number, status: Todo["status"]) => void;
}

export default function TodoItem({
  todo,
  onUpdate,
  onDelete,
  onStatusChange,
}: TodoItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedTodo, setEditedTodo] = useState<Todo>(todo);

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high":
        return "bg-red-100 text-red-800 border-red-200";
      case "medium":
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "low":
        return "bg-green-100 text-green-800 border-green-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-800 border-green-200";
      case "in-progress":
        return "bg-blue-100 text-blue-800 border-blue-200";
      case "pending":
        return "bg-gray-100 text-gray-800 border-gray-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case "high":
        return "🔥";
      case "medium":
        return "⚡";
      case "low":
        return "🌱";
      default:
        return "📝";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return "✅";
      case "in-progress":
        return "🔄";
      case "pending":
        return "⏳";
      default:
        return "📋";
    }
  };

  const isOverdue = (dueDate: string) => {
    if (!dueDate) return false;
    return new Date(dueDate) < new Date();
  };

  const handleSave = () => {
    if (editedTodo.title.trim()) {
      onUpdate(editedTodo);
      setIsEditing(false);
    }
  };

  const handleCancel = () => {
    setEditedTodo(todo);
    setIsEditing(false);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          {/* Header with title and badges */}
          <div className="flex items-center space-x-3 mb-3">
            <h3 className="text-lg font-semibold text-gray-900 flex-1">
              {isEditing ? (
                <input
                  type="text"
                  value={editedTodo.title}
                  onChange={(e) =>
                    setEditedTodo((prev) => ({
                      ...prev,
                      title: e.target.value,
                    }))
                  }
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Enter todo title"
                />
              ) : (
                <span
                  className={
                    todo.status === "completed"
                      ? "line-through text-gray-500"
                      : ""
                  }
                >
                  {todo.title}
                </span>
              )}
            </h3>

            <div className="flex items-center space-x-2">
              <span
                className={`px-2 py-1 text-xs font-medium rounded-full border ${getPriorityColor(
                  todo.priority
                )}`}
              >
                {getPriorityIcon(todo.priority)} {todo.priority}
              </span>
              <span
                className={`px-2 py-1 text-xs font-medium rounded-full border ${getStatusColor(
                  todo.status
                )}`}
              >
                {getStatusIcon(todo.status)} {todo.status}
              </span>
              {todo.dueDate && isOverdue(todo.dueDate) && (
                <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800 border border-red-200">
                  ⚠️ Overdue
                </span>
              )}
            </div>
          </div>

          {/* Description */}
          <div className="mb-3">
            {isEditing ? (
              <textarea
                value={editedTodo.description || ""}
                onChange={(e) =>
                  setEditedTodo((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                rows={3}
                placeholder="Enter todo description"
              />
            ) : (
              <p
                className={`text-gray-600 ${
                  todo.status === "completed" ? "line-through" : ""
                }`}
              >
                {todo.description || "No description provided"}
              </p>
            )}
          </div>

          {/* Metadata */}
          <div className="flex items-center space-x-4 text-sm text-gray-500">
            <span className="flex items-center">
              📅 Created: {new Date(todo.createdAt).toLocaleDateString()}
            </span>
            {todo.dueDate && (
              <span
                className={`flex items-center ${
                  isOverdue(todo.dueDate) ? "text-red-600 font-medium" : ""
                }`}
              >
                ⏰ Due: {new Date(todo.dueDate).toLocaleDateString()}
              </span>
            )}
            {todo.updatedAt !== todo.createdAt && (
              <span className="flex items-center">
                ✏️ Updated: {new Date(todo.updatedAt).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center space-x-2 ml-4">
          {isEditing ? (
            <>
              <button
                onClick={handleSave}
                className="text-green-600 hover:text-green-800 font-medium text-sm"
              >
                💾 Save
              </button>
              <button
                onClick={handleCancel}
                className="text-gray-600 hover:text-gray-800 font-medium text-sm"
              >
                ❌ Cancel
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setIsEditing(true)}
                className="text-indigo-600 hover:text-indigo-800 font-medium text-sm"
              >
                ✏️ Edit
              </button>
              <select
                value={todo.status}
                onChange={(e) =>
                  onStatusChange(todo.id, e.target.value as Todo["status"])
                }
                className="text-sm border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="pending">⏳ Pending</option>
                <option value="in-progress">🔄 In Progress</option>
                <option value="completed">✅ Completed</option>
              </select>
              <button
                onClick={() => onDelete(todo.id)}
                className="text-red-600 hover:text-red-800 font-medium text-sm"
              >
                🗑️ Delete
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
