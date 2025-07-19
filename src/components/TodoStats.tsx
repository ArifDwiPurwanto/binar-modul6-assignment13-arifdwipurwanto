"use client";

import { TodoStats as TodoStatsType } from "@/lib/types";

interface TodoStatsProps {
  stats: TodoStatsType;
}

export default function TodoStats({ stats }: TodoStatsProps) {
  const statCards = [
    {
      title: "Total Tasks",
      value: stats.total,
      icon: "📋",
      color: "bg-indigo-500",
      textColor: "text-indigo-600",
    },
    {
      title: "Pending",
      value: stats.pending,
      icon: "⏳",
      color: "bg-yellow-500",
      textColor: "text-yellow-600",
    },
    {
      title: "In Progress",
      value: stats.inProgress,
      icon: "🔄",
      color: "bg-blue-500",
      textColor: "text-blue-600",
    },
    {
      title: "Completed",
      value: stats.completed,
      icon: "✅",
      color: "bg-green-500",
      textColor: "text-green-600",
    },
    {
      title: "Overdue",
      value: stats.overdue,
      icon: "⚠️",
      color: "bg-red-500",
      textColor: "text-red-600",
    },
    {
      title: "Completion Rate",
      value: `${stats.completionRate}%`,
      icon: "📊",
      color: "bg-purple-500",
      textColor: "text-purple-600",
    },
  ];

  const priorityStats = [
    {
      title: "High Priority",
      value: stats.highPriority,
      icon: "🔥",
      color: "bg-red-100",
      textColor: "text-red-800",
    },
    {
      title: "Medium Priority",
      value: stats.mediumPriority,
      icon: "⚡",
      color: "bg-yellow-100",
      textColor: "text-yellow-800",
    },
    {
      title: "Low Priority",
      value: stats.lowPriority,
      icon: "🌱",
      color: "bg-green-100",
      textColor: "text-green-800",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Main Statistics */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          📊 Task Overview
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {statCards.map((card, index) => (
            <div
              key={index}
              className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">
                    {card.title}
                  </p>
                  <p className={`text-2xl font-bold ${card.textColor}`}>
                    {card.value}
                  </p>
                </div>
                <div
                  className={`w-10 h-10 rounded-full ${card.color} flex items-center justify-center text-white text-lg`}
                >
                  {card.icon}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Priority Breakdown */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          🎯 Priority Breakdown
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {priorityStats.map((stat, index) => (
            <div
              key={index}
              className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow"
            >
              <div className="flex items-center space-x-3">
                <div
                  className={`w-12 h-12 rounded-full ${stat.color} flex items-center justify-center text-lg`}
                >
                  {stat.icon}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-600">
                    {stat.title}
                  </p>
                  <p className={`text-xl font-bold ${stat.textColor}`}>
                    {stat.value}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Progress Bar */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          📈 Progress
        </h3>
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">
              Completion Progress
            </span>
            <span className="text-sm font-bold text-indigo-600">
              {stats.completionRate}%
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div
              className="bg-indigo-600 h-3 rounded-full transition-all duration-300"
              style={{ width: `${stats.completionRate}%` }}
            ></div>
          </div>
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>0%</span>
            <span>50%</span>
            <span>100%</span>
          </div>
        </div>
      </div>

      {/* Quick Insights */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          💡 Quick Insights
        </h3>
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="space-y-2">
            {stats.overdue > 0 && (
              <div className="flex items-center text-sm text-red-600">
                <span className="mr-2">⚠️</span>
                <span>
                  {stats.overdue} task{stats.overdue !== 1 ? "s" : ""} overdue
                </span>
              </div>
            )}
            {stats.completionRate >= 80 && (
              <div className="flex items-center text-sm text-green-600">
                <span className="mr-2">🎉</span>
                <span>
                  Great progress! You're {stats.completionRate}% complete
                </span>
              </div>
            )}
            {stats.pending > stats.completed && (
              <div className="flex items-center text-sm text-yellow-600">
                <span className="mr-2">📝</span>
                <span>
                  {stats.pending} task{stats.pending !== 1 ? "s" : ""} still
                  pending
                </span>
              </div>
            )}
            {stats.highPriority > 0 && (
              <div className="flex items-center text-sm text-red-600">
                <span className="mr-2">🔥</span>
                <span>
                  {stats.highPriority} high priority task
                  {stats.highPriority !== 1 ? "s" : ""} to focus on
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
