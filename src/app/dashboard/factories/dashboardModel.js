angular.module('proton.dashboard')
    .factory('dashboardModel', ($filter, $rootScope, confirmModal, CONSTANTS, dashboardConfiguration, downgrade, gettextCatalog, Payment, paymentModal, subscriptionModel, networkActivityTracker, paymentModel) => {

        const { PLUS, PROFESSIONAL, VISIONARY, VPN_BASIC, VPN_PLUS } = CONSTANTS.PLANS.PLAN;
        const MAIL_PLANS = ['free', PLUS, PROFESSIONAL, VISIONARY];
        const { ADDRESS, MEMBER, DOMAIN, SPACE, VPN } = CONSTANTS.PLANS.ADDON;
        const YEARLY = 12;
        const MONTHLY = 1;
        const CACHE_PLAN = {};
        const CACHE_API = {};
        const filter = (amount) => $filter('currency')(amount / 100 / dashboardConfiguration.cycle(), dashboardConfiguration.currency());
        const get = (key) => {
            const cache = angular.copy(CACHE_PLAN);
            return key ? cache[key] : cache;
        };

        const changeAddon = (plan, addon, value) => {
            dashboardConfiguration.addon(plan, addon, value);
            $rootScope.$emit('dashboard', { type: 'addon.updated', data: { plan, addon, value } });
        };

        const selectVpn = (plan = '', vpn = 0) => {
            dashboardConfiguration.addon('free', 'vpnbasic', +(plan === 'vpnbasic'));
            dashboardConfiguration.addon('free', 'vpnplus', +(plan === 'vpnplus'));
            dashboardConfiguration.addon('plus', 'vpnbasic', +(plan === 'vpnbasic'));
            dashboardConfiguration.addon('plus', 'vpnplus', +(plan === 'vpnplus'));
            dashboardConfiguration.addon('professional', 'vpnbasic', +(plan === 'vpnbasic'));
            dashboardConfiguration.addon('professional', 'vpnplus', +(plan === 'vpnplus'));
            dashboardConfiguration.addon('professional', 'vpn', vpn);
            $rootScope.$emit('dashboard', { type: 'vpn.updated' });
        };

        const removeVpn = () => {
            dashboardConfiguration.addon('free', 'vpnbasic', 0);
            dashboardConfiguration.addon('free', 'vpnplus', 0);
            dashboardConfiguration.addon('plus', 'vpnbasic', 0);
            dashboardConfiguration.addon('plus', 'vpnplus', 0);
            dashboardConfiguration.addon('professional', 'vpnbasic', 0);
            dashboardConfiguration.addon('professional', 'vpnplus', 0);
            dashboardConfiguration.addon('professional', 'vpn', 0);
            $rootScope.$emit('dashboard', { type: 'vpn.updated' });
        };

        /**
         * Update VPN addons from subscription
         */
        const updateVpn = () => {
            const vpnbasic = +subscriptionModel.hasPaid('vpnbasic');
            const vpnplus = +subscriptionModel.hasPaid('vpnplus');
            const vpn = subscriptionModel.count('vpn');

            dashboardConfiguration.addon('free', 'vpnbasic', vpnbasic);
            dashboardConfiguration.addon('free', 'vpnplus', vpnplus);
            dashboardConfiguration.addon('plus', 'vpnbasic', vpnbasic);
            dashboardConfiguration.addon('plus', 'vpnplus', vpnplus);
            dashboardConfiguration.addon('professional', 'vpnbasic', vpnbasic);
            dashboardConfiguration.addon('professional', 'vpnplus', vpnplus);
            dashboardConfiguration.addon('professional', 'vpn', vpn);
            $rootScope.$emit('dashboard', { type: 'vpn.updated' });
        };

        const initVpn = (plan = '') => {
            dashboardConfiguration.addon(plan, 'vpnbasic', +subscriptionModel.hasPaid('vpnbasic'));
            dashboardConfiguration.addon(plan, 'vpnplus', +subscriptionModel.hasPaid('vpnplus'));
            (plan === 'professional') && dashboardConfiguration.addon(plan, 'vpn', subscriptionModel.count('vpn'));
            $rootScope.$emit('dashboard', { type: 'vpn.updated', data: { plan } });
        };

        const query = (currency = 'USD', cycle = YEARLY) => {
            const key = `plans-${currency}-${cycle}`;
            const { Plans = [] } = CACHE_API[key] || {};

            return Plans;
        };

        const collectPlans = (plan) => {
            const plans = [];
            const cache = CACHE_PLAN[dashboardConfiguration.cycle()];
            const config = dashboardConfiguration.get();

            switch (plan) {
                case 'free':
                    config.free.vpnbasic && plans.push(cache.addons[VPN_BASIC]);
                    config.free.vpnplus && plans.push(cache.addons[VPN_PLUS]);
                    break;
                case 'plus':
                    plans.push(cache.plan[PLUS]);
                    config.plus.vpnbasic && plans.push(cache.addons[VPN_BASIC]);
                    config.plus.vpnplus && plans.push(cache.addons[VPN_PLUS]);
                    _.times(config.plus.space, () => plans.push(cache.addons[SPACE]));
                    _.times(config.plus.address, () => plans.push(cache.addons[ADDRESS]));
                    _.times(config.plus.domain, () => plans.push(cache.addons[DOMAIN]));
                    break;
                case 'professional':
                    plans.push(cache.plan[PROFESSIONAL]);
                    config.professional.vpnbasic && plans.push(cache.addons[VPN_BASIC]);
                    config.professional.vpnplus && plans.push(cache.addons[VPN_PLUS]);
                    _.times(config.professional.member, () => plans.push(cache.addons[MEMBER]));
                    _.times(config.professional.domain, () => plans.push(cache.addons[DOMAIN]));
                    _.times(config.professional.vpn, () => plans.push(cache.addons[VPN]));
                    break;
                case 'visionary':
                    plans.push(cache.plan[VISIONARY]);
                    break;
            }

            return plans;
        };

        const selectPlan = (plan, choice) => {
            const plans = collectPlans(plan);

            if (plan === 'free' && !plans.length) {
                return downgrade();
            }

            const PlanIDs = _.pluck(plans, 'ID'); // Map plan IDs
            const promise = Payment.valid({
                Cycle: dashboardConfiguration.cycle(),
                Currency: dashboardConfiguration.currency(),
                PlanIDs,
                Coupon: subscriptionModel.coupon()
            })
                .then(({ data: valid = {} } = {}) => {

                    if (valid.Error) {
                        throw new Error(valid.Error);
                    }

                    paymentModal.activate({
                        params: {
                            planIDs: PlanIDs,
                            valid, choice, plan,
                            cancel() {
                                paymentModal.deactivate();
                            }
                        }
                    });

                });

            networkActivityTracker.track(promise);
        };

        const fetchPlans = (currency = 'USD', cycle = YEARLY) => {
            const key = `plans-${currency}-${cycle}`;

            if (CACHE_API[key]) {
                return Promise.resolve(CACHE_API[key]);
            }

            return Payment.plans(currency, cycle)
                .then(({ data = {} }) => {
                    if (data.Code !== 1000) {
                        throw new Error(data.Error);
                    }
                    CACHE_API[key] = data;
                    return data;
                });
        };

        /**
         * Load plan for a cycle and a currency, then create a map for them
         *  - addons: (Type === 0)
         *  - plan: (Type === 1)
         *  - vpn: (Type === 1)
         *  And a list of plan, ProtonMail plan (not vpn)
         *  And a map between Name and Amount
         * @param  {String} currency
         * @param  {Number} cycle
         * @return {Promise}
         */
        const loadPlanCycle = (currency, cycle = YEARLY) => {
            return fetchPlans(currency, cycle)
                .then((data = {}) => {
                    const { list, addons, plan, amounts } = (data.Plans || []).reduce((acc, plan) => {
                        acc.amounts[plan.Name] = plan.Amount;

                        if (_.contains(MAIL_PLANS, plan.Name)) {
                            acc.plan[plan.Name] = plan;
                            acc.list.push(plan);
                            return acc;
                        }

                        acc.addons[plan.Name] = plan;

                        return acc;
                    }, { addons: {}, plan: {}, list: [], amounts: {} });

                    return { list, addons, plan, amounts };
                });
        };

        /**
         * Load all plans for a currency then create a cache representation
         * for them sorted by Cycle alias.
         *  - yearly = cycle = 12
         *  - monthly = cycle = 1
         * Each key contains 4 keys with 3 maps and a list.
         * @param  {String} Currency
         * @return {Promise}
         */
        const loadPlans = (Currency = dashboardConfiguration.currency()) => {
            const promise = Promise.all([ loadPlanCycle(Currency), loadPlanCycle(Currency, MONTHLY) ])
                .then(([ yearly, monthly ]) => {
                    CACHE_PLAN[YEARLY] = angular.copy(yearly);
                    CACHE_PLAN[MONTHLY] = angular.copy(monthly);

                    return angular.copy(CACHE_PLAN);
                });

            networkActivityTracker.track(promise);

            return promise;
        };

        const changeCurrency = (currency) => {
            loadPlans(currency)
                .then((data) => {
                    dashboardConfiguration.set('currency', currency);
                    $rootScope.$emit('dashboard', { type: 'currency.updated', data: _.extend(data, { currency }) });
                });
        };

        /**
         * Get amounts for each plans
         * @param  {Number} cycle
         * @return {Object}
         */
        const amounts = (cycle = dashboardConfiguration.cycle()) => angular.copy(CACHE_PLAN[cycle].amounts);

        /**
         * Get addon amount for the current dashboard configuration
         * @param  {Object}
         * @return {Integer}
         */
        const amount = ({ plan, addon, cycle = dashboardConfiguration.cycle() }) => {
            const config = dashboardConfiguration.get();

            switch (addon) {
                case 'vpn':
                    return CACHE_PLAN[cycle].amounts[VPN] * config[plan].vpn;
                case 'address':
                    return CACHE_PLAN[cycle].amounts[ADDRESS] * config[plan].address;
                case 'space':
                    return CACHE_PLAN[cycle].amounts[SPACE] * config[plan].space;
                case 'domain':
                    return CACHE_PLAN[cycle].amounts[DOMAIN] * config[plan].domain;
                case 'member':
                    return CACHE_PLAN[cycle].amounts[MEMBER] * config[plan].member;
                case 'vpnbasic':
                    return CACHE_PLAN[cycle].amounts[VPN_BASIC] * config[plan].vpnbasic;
                case 'vpnplus':
                    return CACHE_PLAN[cycle].amounts[VPN_PLUS] * config[plan].vpnplus;
            }

            switch (plan) {
                case 'plus':
                case 'professional':
                case 'visionary':
                    return CACHE_PLAN[cycle].amounts[plan];
                default:
                    return 0;
            }
        };

        /**
         * Get plan total
         * @param  {[type]} plan  [description]
         * @param  {[type]} cycle [description]
         * @return {[type]}       [description]
         */
        const total = (plan, cycle) => {
            let result = 0;

            switch (plan) {
                case 'free':
                    result += amount({ plan, cycle, addon: 'vpnbasic' });
                    result += amount({ plan, cycle, addon: 'vpnplus' });
                    break;
                case 'plus':
                    result += amount({ plan, cycle });
                    result += amount({ plan, cycle, addon: 'address' });
                    result += amount({ plan, cycle, addon: 'space' });
                    result += amount({ plan, cycle, addon: 'domain' });
                    result += amount({ plan, cycle, addon: 'vpnbasic' });
                    result += amount({ plan, cycle, addon: 'vpnplus' });
                    break;
                case 'professional':
                    result += amount({ plan, cycle });
                    result += amount({ plan, cycle, addon: 'member' });
                    result += amount({ plan, cycle, addon: 'domain' });
                    result += amount({ plan, cycle, addon: 'vpnbasic' });
                    result += amount({ plan, cycle, addon: 'vpnplus' });
                    result += amount({ plan, cycle, addon: 'vpn' });
                    break;
                case 'visionary':
                    result += amount({ plan: 'visionary', cycle });
                    break;
            }

            return result;
        };

        const changeCycle = (cycle) => {
            dashboardConfiguration.set('cycle', cycle);
            $rootScope.$emit('dashboard', { type: 'cycle.updated', data: { cycle } });
        };

        $rootScope.$on('subscription', (event, { type }) => {
            (type === 'update') && updateVpn();
        });

        $rootScope.$on('dashboard', (event, { type, data = {} }) => {
            (type === 'change.cycle') && changeCycle(data.cycle);
            (type === 'change.currency') && changeCurrency(data.currency);
            (type === 'change.addon') && changeAddon(data.plan, data.addon, data.value);
            (type === 'select.plan') && selectPlan(data.plan);
            (type === 'select.vpn') && selectVpn(data.plan, data.vpn);
            (type === 'remove.vpn') && removeVpn();
            (type === 'init.vpn') && initVpn(data.plan);
        });

        $rootScope.$on('modal.payment', (e, { type, data }) => {
            if (type === 'process.success') {
                const promise = Promise.all([
                    subscriptionModel.fetch(),
                    paymentModel.getMethods(true)
                ]);
                networkActivityTracker.track(promise);
            }

            if (type === 'switch') {
                const { Cycle, Currency, plan } = data;

                paymentModal.deactivate();
                dashboardConfiguration.set('currency', Currency);
                dashboardConfiguration.set('cycle', Cycle);

                loadPlanCycle(Currency, Cycle)
                    .then(() => {
                        selectPlan(plan, 'paypal');
                    });
            }
        });

        return { init: angular.noop, loadPlans, get, query, amount, amounts, total, filter };
    });
