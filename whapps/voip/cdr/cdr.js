winkstart.module('voip', 'cdr', {
	css: [
		'css/cdr.css'
	],

	templates: {
		cdr: 'tmpl/cdr.html',
		cdr_details: 'tmpl/cdr_details.html'
	},

	subscribe: {
		'cdr.activate': 'activate',
	},

	resources: {
		'cdr.list': {
			url: '{api_url}/accounts/{account_id}/cdrs',
			contentType: 'application/json',
			verb: 'GET'
		},
		'cdr.read': {
			url: '{api_url}/accounts/{account_id}/cdrs/{cdr_id}',
			contentType: 'application/json',
			verb: 'GET'
		},
		'cdr.list_by_week': {
			url: '{api_url}/accounts/{account_id}/cdrs?created_from={created_from}&created_to={created_to}',
			contentType: 'application/json',
			verb: 'GET'
		},
		'cdr.from_queue': {
			url: '{api_url}/accounts/{account_id}/cdrs?created_from={created_from}&created_to={created_to}&has_key={filter}',
			contentType: 'application/json',
			verb: 'GET'
		},
		'cdr.not_from_queue': {
			url: '{api_url}/accounts/{account_id}/cdrs?created_from={created_from}&created_to={created_to}&key_missing={filter}',
			contentType: 'application/json',
			verb: 'GET'
		}
	}
},
function (args) {
	winkstart.registerResources(this.__whapp, this.config.resources);

	winkstart.publish('whappnav.subnav.add', {
		whapp: 'voip',
		module: this.__module,
		label: _t('cdr', 'call_history_label'),
		icon: 'cdr',
		weight: '50',
		category: _t('config', 'advanced_menu_cat')
	});
},
{
	cdr_range: 7,

	list_by_date: function (start_date, end_date, filter) {
		var THIS = this,
			filter = filter || '',
			map_users = {},
			parse_duration = function (duration, type) {
				var duration = parseFloat(duration);
				seconds = duration % 60,
				minutes = ((duration - seconds) / 60) % 60,
				hours = Math.floor((duration - seconds) / 3600),
				type = type || 'numbers';

				if (hours < 10 && type == 'numbers') {
					hours = '0' + hours;
				}
				if (minutes < 10) {
					minutes = '0' + minutes;
				}
				if (seconds < 10) {
					seconds = '0' + seconds;
				}

				if (type == 'verbose') {
					duration = hours + ' hours ' + minutes + ' minutes and ' + seconds + ' seconds';
				}
				else {
					duration = hours + ':' + minutes + ':' + seconds;
				}

				return duration;
			},
			find_user_name = function (owner_id) {
				var parsed_name = '';

				if (owner_id && map_users[owner_id]) {
					parsed_name = map_users[owner_id].first_name + ' ' + map_users[owner_id].last_name;
				}

				return parsed_name;
			},
			parse_date = function (timestamp) {
				var parsed_date = '-';

				if (timestamp) {
					var date = new Date((timestamp - 62167219200) * 1000),
						month = date.getMonth() + 1,
						year = date.getFullYear(),
						day = date.getDate(),
						humanDate = month + '/' + day + '/' + year,
						humanTime = date.toLocaleTimeString();

					parsed_date = humanDate + ' ' + humanTime;
				}

				return parsed_date;
			},
			parse_cdr_id = function (cdr_id) {
				return cdr_id.substr(0, 1) + '/' + cdr_id.substr(1, 1) + '/' + cdr_id.substr(2, 1) + '/' + cdr_id;
			};

		winkstart.parallel({
			user_list: function (callback) {
				winkstart.request(true, 'user.list', {
					account_id: winkstart.apps['voip'].account_id,
					api_url: winkstart.apps['voip'].api_url
				},
				function (_data, status) {
					$.each(_data.data, function () {
						map_users[this.id] = this;
					});

					callback(null, _data);
				}
				);
			},
			cdr_list: function (callback) {
				var request_string = 'cdr.list_by_week',
					data_request = {
						account_id: winkstart.apps['voip'].account_id,
						api_url: winkstart.apps['voip'].api_url,
						created_from: start_date,
						created_to: end_date
					};

				if (filter === 'queue') {
					request_string = 'cdr.from_queue';
					data_request.filter = 'custom_channel_vars.queue_id';
				}
				else if (filter === 'non-queue') {
					request_string = 'cdr.not_from_queue';
					data_request.filter = 'custom_channel_vars.queue_id';
				}

				winkstart.request(true, request_string, data_request,
					function (_data, status) {
						callback(null, _data);
					}
				);
			}
		},
		function (err, results) {
			var cdr_id,
				owner_id,
				user_name,
				duration,
				humanFullDate,
				web_browser_id,
				call_duration = 0,
				cost;

			var tab_data = [];

			$.each(results.cdr_list.data, function () {
				cdr_id = this.cid || this.id;
				user_name = this.owner_id ? find_user_name(this.owner_id) : '',
				duration = this.duration_seconds >= 0 ? parse_duration(this.duration_seconds) : '--';
				humanFullDate = parse_date(this.timestamp);
				web_browser_id = parse_cdr_id(cdr_id);
				call_duration += this.billing_seconds >= 0 ? parseFloat(this.billing_seconds) : 0;
				cost = this.cost ? '$' + parseFloat((this.cost) / 10000).toFixed(2) : '-';

				tab_data.push([
					this.caller_id_number === this.caller_id_name ? this.caller_id_number || _t('cdr', 'empty') : this.caller_id_number + ' (' + this.caller_id_name + ')',
					this.callee_id_number === this.callee_id_name ? this.callee_id_number || ((this.to) ? this.to.substring(0, this.to.indexOf('@') != -1 ? this.to.indexOf('@') : this.to.length) : _t('cdr', 'empty')) || _t('cdr', 'empty') : this.callee_id_number + ' (' + this.callee_id_name + ')',
					user_name ? '<a href="javascript:void(0);" id="' + this.owner_id + '" class="table_owner_link">' + user_name + '</a>' : _t('cdr', 'no_owner'),
					duration || '-',
					this.hangup_cause || '-',
					/*'<a href="' + winkstart.config.logs_web_server_url + web_browser_id + '.log" target="_blank">Log</a>&nbsp;|&nbsp;' +*/
					'<a href="javascript:void(0);" data-cdr_id="' + cdr_id + '"  class="table_detail_link">' + _t('cdr', 'details') + '</a>',
					cost,
					{ display: humanFullDate, value: this.unix_timestamp_micro || this.timestamp },
					cdr_id,
					this.billing_seconds || ''
				]);
			});

			call_duration = _t('cdr', 'total_duration') + parse_duration(call_duration, 'verbose');
			$('.call_duration', '#cdr-grid_wrapper').text(call_duration);

			winkstart.table.cdr.fnAddData(tab_data);
		}
		);
	},

	export_by_date: function (start_date, end_date, filter) {
		var THIS = this,
			filter = filter || '',
			map_users = {},
			parse_duration = function (duration, type) {
				var duration = parseFloat(duration);
				seconds = duration % 60,
				minutes = ((duration - seconds) / 60) % 60,
				hours = Math.floor((duration - seconds) / 3600),
				type = type || 'numbers';

				if (hours < 10 && type == 'numbers') {
					hours = '0' + hours;
				}
				if (minutes < 10) {
					minutes = '0' + minutes;
				}
				if (seconds < 10) {
					seconds = '0' + seconds;
				}

				if (type == 'verbose') {
					duration = hours + ' hours ' + minutes + ' minutes and ' + seconds + ' seconds';
				}
				else {
					duration = hours + ':' + minutes + ':' + seconds;
				}

				return duration;
			},
			find_user_name = function (owner_id) {
				var parsed_name = '';

				if (owner_id && map_users[owner_id]) {
					parsed_name = map_users[owner_id].first_name + ' ' + map_users[owner_id].last_name;
				}

				return parsed_name;
			},
			parse_date = function (timestamp) {
				var parsed_date = '-';

				if (timestamp) {
					var date = new Date((timestamp - 62167219200) * 1000),
						month = date.getMonth() + 1,
						year = date.getFullYear(),
						day = date.getDate(),
						humanDate = month + '/' + day + '/' + year,
						humanTime = date.toLocaleTimeString();

					parsed_date = humanDate + ' ' + humanTime;
				}

				return parsed_date;
			},
			parse_cdr_id = function (cdr_id) {
				return cdr_id.substr(0, 1) + '/' + cdr_id.substr(1, 1) + '/' + cdr_id.substr(2, 1) + '/' + cdr_id;
			};

		winkstart.parallel({
			user_list: function (callback) {
				winkstart.request(true, 'user.list', {
					account_id: winkstart.apps['voip'].account_id,
					api_url: winkstart.apps['voip'].api_url
				},
				function (_data, status) {
					$.each(_data.data, function () {
						map_users[this.id] = this;
					});

					callback(null, _data);
				}
				);
			},
			cdr_list: function (callback) {
				var request_string = 'cdr.list_by_week',
					data_request = {
						account_id: winkstart.apps['voip'].account_id,
						api_url: winkstart.apps['voip'].api_url,
						created_from: start_date,
						created_to: end_date
					};

				if (filter === 'queue') {
					request_string = 'cdr.from_queue';
					data_request.filter = 'custom_channel_vars.queue_id';
				}
				else if (filter === 'non-queue') {
					request_string = 'cdr.not_from_queue';
					data_request.filter = 'custom_channel_vars.queue_id';
				}

				winkstart.request(true, request_string, data_request,
					function (_data, status) {
						callback(null, _data);
					}
				);
			}
		},
		function (err, results) {
			var cdr_id,
				owner_id,
				user_name,
				duration,
				humanFullDate,
				web_browser_id,
				call_duration = 0,
				cost;

			var tab_data = [];

			$.each(results.cdr_list.data, function () {
				cdr_id = this.cid || this.id;
				user_name = this.owner_id ? find_user_name(this.owner_id) : '',
				duration = this.duration_seconds >= 0 ? parse_duration(this.duration_seconds) : '--';
				humanFullDate = parse_date(this.timestamp);
				web_browser_id = parse_cdr_id(cdr_id);
				call_duration += this.billing_seconds >= 0 ? parseFloat(this.billing_seconds) : 0;
				cost = this.cost ? '$' + parseFloat((this.cost) / 10000).toFixed(2) : '-';

				tab_data.push([
					this.caller_id_number === this.caller_id_name ? this.caller_id_number || _t('cdr', 'empty') : this.caller_id_number + ' (' + this.caller_id_name + ')',
					this.callee_id_number === this.callee_id_name ? this.callee_id_number || ((this.to) ? this.to.substring(0, this.to.indexOf('@') != -1 ? this.to.indexOf('@') : this.to.length) : _t('cdr', 'empty')) || _t('cdr', 'empty') : this.callee_id_number + ' (' + this.callee_id_name + ')',
					user_name ? '<a href="javascript:void(0);" id="' + this.owner_id + '" class="table_owner_link">' + user_name + '</a>' : _t('cdr', 'no_owner'),
					duration || '-',
					this.hangup_cause || '-',
					/*'<a href="' + winkstart.config.logs_web_server_url + web_browser_id + '.log" target="_blank">Log</a>&nbsp;|&nbsp;' +*/
					'<a href="javascript:void(0);" data-cdr_id="' + cdr_id + '"  class="table_detail_link">' + _t('cdr', 'details') + '</a>',
					cost,
					{ display: humanFullDate, value: this.unix_timestamp_micro || this.timestamp },
					cdr_id,
					this.billing_seconds || ''
				]);
			});

			/**
			 * only download if there's data available.
			 */
			if (tab_data.length > 1) {
				/**
				 * Download the CSV directly through Crossbar API
				 **/
				csv_file_name = parse_date(start_date).split(" ")[0].replace(/\//g, '-') + '_' + parse_date(end_date).split(" ")[0].replace(/\//g, '-') + '_cdr.csv';
				var download_link = winkstart.apps['voip'].api_url + '/accounts/' +
					winkstart.apps['voip'].account_id + '/cdrs?' +
					'&accept=text/csv' +
					'&file_name=' + csv_file_name +
					'&created_from=' + start_date +
					'&created_to=' + end_date +
					'&auth_token=' + winkstart.apps['voip'].auth_token;

				if (filter === 'queue') {
					download_link = download_link + '&has_key=custom_channel_vars.queue_id';
				}
				else if (filter === 'non-queue') {
					download_link = download_link + '&key_missing=custom_channel_vars.queue_id';
				}
				window.location.href = download_link;
			}

			call_duration = _t('cdr', 'total_duration') + parse_duration(call_duration, 'verbose');
			$('.call_duration', '#cdr-grid_wrapper').text(call_duration);

			winkstart.table.cdr.fnAddData(tab_data);
		}
		);
	},

	init_table: function (parent) {
		var cdr_html = parent,
			columns = [
				{
					'sTitle': _t('cdr', 'from_caller_id_stitle'),
					'sWidth': '250px'
				},
				{
					'sTitle': _t('cdr', 'to_dialed_number_stitle'),
					'sWidth': '250px'
				},
				{
					'sTitle': _t('cdr', 'owner_stitle'),
					'sWidth': '160px'
				},
				{
					'sTitle': _t('cdr', 'duration_stitle'),
					'sWidth': '110px'
				},
				{
					'sTitle': _t('cdr', 'hangup_cause_stitle'),
					'sWidth': '160px'
				},
				{
					'sTitle': _t('cdr', 'actions_stitle'),
					'sWidth': '80px',
					'bSortable': false
				},
				{
					'sTitle': _t('cdr', 'cost_stitle')
				},
				{
					'sTitle': _t('cdr', 'date_stitle'),
					'sType': 'numeric-wrapper-obj',
					'fnRender': function(oObj) {
						return oObj.aData[oObj.iDataColumn].display;
					},
					'bUseRendered': false
				},
				{
					'sTitle': _t('cdr', 'cdr_id_stitle'),
					'bVisible': false
				},
				{
					'sTitle': _t('cdr', 'billing_seconds_stitle'),
					'bVisible': false
				}
			];

		winkstart.table.create('cdr', $('#cdr-grid', cdr_html), columns, {}, {
			sDom: '<"date">frtlip',
			aaSorting: [[7, 'desc']]
		});

		$('.cancel-search', cdr_html).click(function () {
			$('#registration-grid_filter input[type=text]', cdr_html).val('');
			winkstart.table.cdr.fnFilter('');
		});
	},

	parse_data_cdr: function(data, parent_key) {
		var return_data = [],
			return_sub_data,
			THIS = this;

		function hide_fqdn(value) {
			return value = (winkstart.config.hide_fqdn) ? value.replace('.2600hz.com', '') : value;
		}

		$.each(data, function (k, v) {
			if (typeof v == 'object') {
				return_sub_data = THIS.parse_data_cdr(this, k);

				$.each(return_sub_data, function (k2, v2) {
					if (jQuery.inArray(v2.key, ['app_name', 'app_version', 'server_id', 'id']) < 0) {
						v2.value = hide_fqdn(v2.value);
						return_data.push({'key': v2.key, 'value': v2.value});
					}
				});
			}
			else {
				if (jQuery.inArray(k, ['app_name', 'app_version', 'server_id', 'id']) < 0) {
					v = hide_fqdn(v);
					return_data.push({ 'key': typeof k === 'number' ? parent_key + '_' + k : k, 'value': v });
				}
			}
		});
		return return_data;
	},

	activate: function (data) {
		var THIS = this,
			cdr_html = this.templates.cdr.tmpl({}),
			init_range = 1,
			range = THIS.cdr_range;

		$('#ws-content').empty().append(cdr_html);

		THIS.init_table(cdr_html);

		$.fn.dataTableExt.afnFiltering.pop();

		$('div.date', cdr_html).html(_t('cdr', 'start_date') + '<input id="startDate" readonly="readonly" type="text"/>&nbsp;&nbsp;' + _t('cdr', 'end_date') + '<input id="endDate" readonly="readonly" type="text"/>&nbsp;&nbsp;&nbsp;&nbsp;<select id="dropdown_filter"><option value="all">' + _t('cdr', 'all_calls') + '</option><option value="queue">' + _t('cdr', 'queue_calls') + '</option><option value="non-queue">' + _t('cdr', 'non_queue_calls') + '</option></select><button class="btn primary button-search" id="searchLink">' + _t('cdr', 'filter') + '</button><button style="margin-left: 15px;" class="btn primary button-search" id="exportLink">' + _t('cdr', 'export') + '</button><label class="call_duration"/>');

		$(cdr_html).delegate('.table_owner_link', 'click', function () {
			winkstart.publish('user.popup_edit', {id: $(this).attr('id')});
		});

		$('#cdr-grid_filter input[type=text]', '#cdr-grid_wrapper').keyup(function () {
			if ($(this).val() != '') {
				$('.call_duration', '#cdr-grid_wrapper').hide();
			}
			else {
				$('.call_duration', '#cdr-grid_wrapper').show();
			}
		});

		if (!('call_center' in winkstart.apps)) {
			$('#dropdown_filter', cdr_html).hide();
		}

		$(cdr_html).delegate('.table_detail_link', 'click', function () {
			var cdr_id = $(this).dataset('cdr_id');

			winkstart.request(true, 'cdr.read', {
				account_id: winkstart.apps['voip'].account_id,
				api_url: winkstart.apps['voip'].api_url,
				cdr_id: cdr_id,
			},
			function (_data, status) {
				var cdr_data = THIS.parse_data_cdr(_data.data);
				cdr_data = cdr_data.sort(function (a, b) {
					var keyA = a.key.toLowerCase(),
						keyB = b.key.toLowerCase();

					return keyA <= keyB ? -1 : 1;
				});

				var tmpl_data = {
					cdr_fields: cdr_data,
					_t: function (param) {
						return window.translate['cdr'][param];
					}
				}

				cdr_detail_html = THIS.templates.cdr_details.tmpl(tmpl_data);
				winkstart.dialog(cdr_detail_html, {
					title: _t('cdr', 'detail_of_cdr_title') + cdr_id,
					width: '840px',
					height: 'auto',
					open: function () {
						// Gross hack to prevent scroll bar glitch (should be in the css sheet)
						$(this).css('overflow-x', 'hidden');
						$(this).css('max-height', $(document).height() - 180);
					}
				}
				);
			}
			);
		});

		$('#searchLink', cdr_html).click(function () {
			var start_date = $('#startDate', cdr_html).val(),
				end_date = $('#endDate', cdr_html).val(),
				/* I18N - need re-writing for national date formats */
				regex = /^(0[1-9]|1[012])[- \/.](0[1-9]|[12][0-9]|3[01])[- \/.](19|20)\d\d$/;

			winkstart.table.cdr.fnClearTable();
			$('.call_duration', '#cdr-grid_wrapper').text('');

			if (start_date.match(regex) && end_date.match(regex)) {
				var start_date_sec = (new Date(start_date).getTime() / 1000) + 62167219200,
					end_date_sec = (new Date(end_date).getTime() / 1000) + 62167219200;

				if ((end_date_sec - start_date_sec) <= (range * 24 * 60 * 60)) {
					THIS.list_by_date(start_date_sec, end_date_sec, $('#dropdown_filter', cdr_html).val());
				}
				else {
					winkstart.alert(_t('cdr', 'the_range_is_bigger'));
				}
			}
			else {
				winkstart.alert(_t('cdr', 'dates_in_the_filter'));
			}
		});

		$('#exportLink', cdr_html).click(function () {
			var start_date = $('#startDate', cdr_html).val(),
				end_date = $('#endDate', cdr_html).val(),
				/* I18N - need re-writing for national date formats */
				regex = /^(0[1-9]|1[012])[- \/.](0[1-9]|[12][0-9]|3[01])[- \/.](19|20)\d\d$/;

			winkstart.table.cdr.fnClearTable();
			$('.call_duration', '#cdr-grid_wrapper').text('');

			if (start_date.match(regex) && end_date.match(regex)) {
				var start_date_sec = (new Date(start_date).getTime() / 1000) + 62167219200,
					end_date_sec = (new Date(end_date).getTime() / 1000) + 62167219200;

				if ((end_date_sec - start_date_sec) <= (range * 24 * 60 * 60)) {
					THIS.export_by_date(start_date_sec, end_date_sec, $('#dropdown_filter', cdr_html).val());
				}
				else {
					winkstart.alert(_t('cdr', 'the_range_is_bigger'));
				}
			}
			else {
				winkstart.alert(_t('cdr', 'dates_in_the_filter'));
			}
		});

		THIS.init_datepicker(cdr_html);

		var tomorrow = new Date(THIS.to_string_date(new Date()));
		tomorrow.setDate(tomorrow.getDate() + 1);

		var end_date = Math.floor(tomorrow.getTime() / 1000) + 62167219200,
			start_date = end_date - (init_range * 24 * 60 * 60);

		THIS.list_by_date(start_date, end_date);
	},

	init_datepicker: function (parent) {
		var THIS = this,
			cdr_html = parent,
			$start_date = $('#startDate', cdr_html),
			$end_date = $('#endDate', cdr_html),
			start_date = new Date(),
			end_date,
			tomorrow = new Date(),
			init_range = 1,
			range = THIS.cdr_range;

		tomorrow.setDate(tomorrow.getDate() + 1);

		$('#startDate, #endDate', cdr_html).datepicker(
			{
				beforeShow: customRange,
				onSelect: customSelect
			}
		);

		end_date = tomorrow;
		start_date.setDate(new Date().getDate() - init_range + 1);

		$start_date.datepicker('setDate', start_date);
		$end_date.datepicker('setDate', end_date);

		function customSelect(dateText, input) {
			var date_min,
				date_max;

			if (input.id == 'startDate') {
				date_min = $start_date.datepicker('getDate');
				if ($end_date.datepicker('getDate') == null) {
					date_max = date_min;
					date_max.setDate(date_min.getDate() + range);
					$end_date.val(THIS.to_string_date(date_max));
				}
				else {
					date_max = $end_date.datepicker('getDate');
					if ((date_max > (new Date(date_min).setDate(date_min.getDate() + range)) || (date_max <= date_min))) {
						date_max = date_min;
						date_max.setDate(date_max.getDate() + range);
						date_max > tomorrow ? date_max = tomorrow : true;
						$end_date.val(THIS.to_string_date(date_max));
					}
				}
			}
			else if (input.id == 'endDate') {
				if ($start_date.datepicker('getDate') == null) {
					date_min = $end_date.datepicker('getDate');
					date_min.setDate(date_min.getDate() - 1);
					$start_date.val(THIS.to_string_date(date_min));
				}
			}
		};

		function customRange(input) {
			var date_min = new Date(2011, 0, 0),
				date_max,
				range = THIS.cdr_range;

			if (input.id == 'endDate') {
				date_max = tomorrow;
				if ($start_date.datepicker('getDate') != null) {
					date_min = $start_date.datepicker('getDate');
					/* Range of 1 day minimum */
					date_min.setDate(date_min.getDate() + 1);
					date_max = $start_date.datepicker('getDate');
					date_max.setDate(date_max.getDate() + range);

					if (date_max > tomorrow) {
						date_max = tomorrow;
					}
				}
			}
			else if (input.id == 'startDate') {
				date_max = new Date();
			}

			return {
				minDate: date_min,
				maxDate: date_max
			};
		}
	},

	to_string_date: function (date) {
		var day = date.getDate(),
			month = date.getMonth() + 1,
			year = date.getFullYear();

		day < 10 ? day = '0' + day : true;
		month < 10 ? month = '0' + month : true;

		return month + '/' + day + '/' + year;
	}
});
