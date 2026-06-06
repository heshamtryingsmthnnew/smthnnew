// Session clustering configuration.
// SESSION_CLUSTER_HOURS is the only place this threshold is defined.
// Pass it as the p_cluster_hours argument to get_or_create_active_session() — never inline.
const SESSION_CLUSTER_HOURS = 4;

module.exports = { SESSION_CLUSTER_HOURS };
